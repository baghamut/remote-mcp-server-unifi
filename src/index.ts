import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

type UnifiEnv = {
	UNIFI_API_KEY: string;
};

const SITE_MANAGER_API = "https://api.ui.com";

function jsonResult(result: unknown) {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(result, null, 2),
			},
		],
	};
}

async function unifiRequest(
	env: UnifiEnv,
	baseUrl: string,
	path: string,
	method = "GET",
	body?: unknown,
): Promise<unknown> {
	const headers: Record<string, string> = {
		Accept: "application/json",
		"X-API-Key": env.UNIFI_API_KEY,
	};

	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}

	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});

	const text = await response.text();

	let data: unknown;

	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}

	if (!response.ok) {
		throw new Error(
			`UniFi API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
		);
	}

	return data;
}

async function unifiSiteManagerGet(
	env: UnifiEnv,
	path: string,
): Promise<unknown> {
	return unifiRequest(
		env,
		SITE_MANAGER_API,
		path,
		"GET",
	);
}

/*
 * UniFi Network Integration API
 *
 * Remote API format:
 *
 * https://api.ui.com/v1/connector/consoles/{consoleId}/proxy/network/integration
 *
 * Network endpoints are then appended as:
 *
 * /v1/sites
 * /v1/sites/{siteId}/devices
 * etc.
 */
function networkApiBase(consoleId: string): string {
	return `${SITE_MANAGER_API}/v1/connector/consoles/${encodeURIComponent(consoleId)}/proxy/network/integration`;
}

function createServer(env: UnifiEnv) {
	const server = new McpServer({
		name: "UniFi Network",
		version: "2.0.0",
	});

	// ============================================================
	// SITE MANAGER - READ
	// ============================================================

	server.registerTool(
		"unifi_list_sites",
		{
			description:
				"List all UniFi sites available through the UniFi Site Manager API.",
			inputSchema: {
				pageSize: z.number().int().min(1).max(500).optional(),
				nextToken: z.string().optional(),
			},
		},
		async ({ pageSize, nextToken }) => {
			const params = new URLSearchParams();

			if (pageSize !== undefined) {
				params.set("pageSize", String(pageSize));
			}

			if (nextToken) {
				params.set("nextToken", nextToken);
			}

			const query = params.toString();

			const result = await unifiSiteManagerGet(
				env,
				`/v1/sites${query ? `?${query}` : ""}`,
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_list_hosts",
		{
			description:
				"List all UniFi consoles/hosts available through the UniFi Site Manager API.",
			inputSchema: {
				pageSize: z.number().int().min(1).max(500).optional(),
				nextToken: z.string().optional(),
			},
		},
		async ({ pageSize, nextToken }) => {
			const params = new URLSearchParams();

			if (pageSize !== undefined) {
				params.set("pageSize", String(pageSize));
			}

			if (nextToken) {
				params.set("nextToken", nextToken);
			}

			const query = params.toString();

			const result = await unifiSiteManagerGet(
				env,
				`/v1/hosts${query ? `?${query}` : ""}`,
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_get_host",
		{
			description:
				"Get detailed information about a specific UniFi console/host.",
			inputSchema: {
				id: z.string().min(1),
			},
		},
		async ({ id }) => {
			const result = await unifiSiteManagerGet(
				env,
				`/v1/hosts/${encodeURIComponent(id)}`,
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_list_devices",
		{
			description:
				"List UniFi devices available through the Site Manager API.",
			inputSchema: {
				pageSize: z.number().int().min(1).max(500).optional(),
				nextToken: z.string().optional(),
			},
		},
		async ({ pageSize, nextToken }) => {
			const params = new URLSearchParams();

			if (pageSize !== undefined) {
				params.set("pageSize", String(pageSize));
			}

			if (nextToken) {
				params.set("nextToken", nextToken);
			}

			const query = params.toString();

			const result = await unifiSiteManagerGet(
				env,
				`/v1/devices${query ? `?${query}` : ""}`,
			);

			return jsonResult(result);
		},
	);

	// ============================================================
	// FULL NETWORK API
	// ============================================================

	server.registerTool(
		"unifi_network_request",
		{
			description: `
Execute an authenticated request against the official UniFi Network Integration API.

This provides full read/write access to the Network application through the
UniFi Cloud Connector.

Supported HTTP methods:
GET, POST, PUT, PATCH, DELETE

The path must start with /v1/ and is relative to:
https://api.ui.com/v1/connector/consoles/{consoleId}/proxy/network/integration

Examples:

GET /v1/sites
GET /v1/sites/{siteId}/devices
GET /v1/sites/{siteId}/clients
GET /v1/sites/{siteId}/networks
GET /v1/sites/{siteId}/wifi-broadcasts

POST /v1/sites/{siteId}/devices/{deviceId}/actions
POST /v1/sites/{siteId}/devices/{deviceId}/interfaces/ports/{portIdx}/actions

PATCH /v1/sites/{siteId}/networks/{networkId}
PATCH /v1/sites/{siteId}/wifi-broadcasts/{wifiId}

DELETE /v1/sites/{siteId}/networks/{networkId}
DELETE /v1/sites/{siteId}/wifi-broadcasts/{wifiId}

Use the official UniFi Network API semantics for the request body.

This tool has real write access. Destructive operations such as DELETE,
device restart, configuration changes, firewall changes, VLAN changes and
SSID changes are executed against the UniFi controller.
`,
			inputSchema: {
				consoleId: z.string().min(1),
				method: z.enum([
					"GET",
					"POST",
					"PUT",
					"PATCH",
					"DELETE",
				]),
				path: z
					.string()
					.min(1)
					.regex(/^\/v1\//),
				body: z.unknown().optional(),
			},
		},
		async ({ consoleId, method, path, body }) => {
			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				path,
				method,
				body,
			);

			return jsonResult(result);
		},
	);

	// ============================================================
	// DEVICES
	// ============================================================

	server.registerTool(
		"unifi_device_action",
		{
			description:
				"Execute an action on an adopted UniFi device. Supported actions depend on the device and API version, including RESTART and LOCATE.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				deviceId: z.string().min(1),
				action: z.string().min(1),
			},
		},
		async ({
			consoleId,
			siteId,
			deviceId,
			action,
		}) => {
			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				`/v1/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}/actions`,
				"POST",
				{ action },
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_port_action",
		{
			description:
				"Execute an action on a UniFi switch port, such as POWER_CYCLE or other actions supported by the installed Network API version.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				deviceId: z.string().min(1),
				portIndex: z.number().int().min(1),
				action: z.string().min(1),
			},
		},
		async ({
			consoleId,
			siteId,
			deviceId,
			portIndex,
			action,
		}) => {
			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				`/v1/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}/interfaces/ports/${portIndex}/actions`,
				"POST",
				{ action },
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_adopt_device",
		{
			description:
				"Adopt a pending UniFi device into a UniFi site.",
			inputSchema: {
				consoleId: z.string().min(1),
				mac: z.string().min(1),
				siteId: z.string().min(1),
			},
		},
		async ({
			consoleId,
			mac,
			siteId,
		}) => {
			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				"/v1/pending-devices",
				"POST",
				{
					mac,
					siteId,
				},
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_unadopt_device",
		{
			description:
				"Remove/unadopt an adopted UniFi device from a site.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				deviceId: z.string().min(1),
			},
		},
		async ({
			consoleId,
			siteId,
			deviceId,
		}) => {
			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				`/v1/sites/${encodeURIComponent(siteId)}/devices/${encodeURIComponent(deviceId)}`,
				"DELETE",
			);

			return jsonResult(result);
		},
	);

	// ============================================================
	// CLIENTS
	// ============================================================

	server.registerTool(
		"unifi_client_action",
		{
			description:
				"Execute an action on a UniFi client using the official Network API.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				clientId: z.string().min(1),
				action: z.string().min(1),
				parameters: z.record(z.string(), z.unknown()).optional(),
			},
		},
		async ({
			consoleId,
			siteId,
			clientId,
			action,
			parameters,
		}) => {
			const body = {
				action,
				...(parameters ?? {}),
			};

			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				`/v1/sites/${encodeURIComponent(siteId)}/clients/${encodeURIComponent(clientId)}/actions`,
				"POST",
				body,
			);

			return jsonResult(result);
		},
	);

	// ============================================================
	// GENERIC CRUD HELPERS
	// ============================================================

	server.registerTool(
		"unifi_networks",
		{
			description:
				"List, create, update, get or delete UniFi networks/VLANs.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				method: z.enum([
					"GET",
					"POST",
					"PATCH",
					"PUT",
					"DELETE",
				]),
				networkId: z.string().optional(),
				body: z.unknown().optional(),
			},
		},
		async ({
			consoleId,
			siteId,
			method,
			networkId,
			body,
		}) => {
			const path =
				`/v1/sites/${encodeURIComponent(siteId)}/networks` +
				(networkId
					? `/${encodeURIComponent(networkId)}`
					: "");

			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				path,
				method,
				body,
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_wifi_broadcasts",
		{
			description:
				"List, create, update, get or delete UniFi Wi-Fi broadcasts/SSIDs.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				method: z.enum([
					"GET",
					"POST",
					"PATCH",
					"PUT",
					"DELETE",
				]),
				wifiId: z.string().optional(),
				body: z.unknown().optional(),
			},
		},
		async ({
			consoleId,
			siteId,
			method,
			wifiId,
			body,
		}) => {
			const path =
				`/v1/sites/${encodeURIComponent(siteId)}/wifi-broadcasts` +
				(wifiId
					? `/${encodeURIComponent(wifiId)}`
					: "");

			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				path,
				method,
				body,
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_firewall_zones",
		{
			description:
				"List, create, update, get or delete custom UniFi firewall zones.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				method: z.enum([
					"GET",
					"POST",
					"PATCH",
					"PUT",
					"DELETE",
				]),
				zoneId: z.string().optional(),
				body: z.unknown().optional(),
			},
		},
		async ({
			consoleId,
			siteId,
			method,
			zoneId,
			body,
		}) => {
			const path =
				`/v1/sites/${encodeURIComponent(siteId)}/firewall/zones` +
				(zoneId
					? `/${encodeURIComponent(zoneId)}`
					: "");

			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				path,
				method,
				body,
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_acl_rules",
		{
			description:
				"List, create, update, get or delete UniFi Access Control List rules.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				method: z.enum([
					"GET",
					"POST",
					"PATCH",
					"PUT",
					"DELETE",
				]),
				ruleId: z.string().optional(),
				body: z.unknown().optional(),
			},
		},
		async ({
			consoleId,
			siteId,
			method,
			ruleId,
			body,
		}) => {
			const path =
				`/v1/sites/${encodeURIComponent(siteId)}/acl-rules` +
				(ruleId
					? `/${encodeURIComponent(ruleId)}`
					: "");

			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				path,
				method,
				body,
			);

			return jsonResult(result);
		},
	);

	server.registerTool(
		"unifi_traffic_matching_lists",
		{
			description:
				"List, create, update, get or delete UniFi Traffic Matching Lists.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				method: z.enum([
					"GET",
					"POST",
					"PATCH",
					"PUT",
					"DELETE",
				]),
				listId: z.string().optional(),
				body: z.unknown().optional(),
			},
		},
		async ({
			consoleId,
			siteId,
			method,
			listId,
			body,
		}) => {
			const path =
				`/v1/sites/${encodeURIComponent(siteId)}/traffic-matching-lists` +
				(listId
					? `/${encodeURIComponent(listId)}`
					: "");

			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				path,
				method,
				body,
			);

			return jsonResult(result);
		},
	);

	// ============================================================
	// HOTSPOT VOUCHERS
	// ============================================================

	server.registerTool(
		"unifi_vouchers",
		{
			description:
				"Manage UniFi Hotspot vouchers. Supports listing, getting, generating and deleting vouchers.",
			inputSchema: {
				consoleId: z.string().min(1),
				siteId: z.string().min(1),
				method: z.enum([
					"GET",
					"POST",
					"DELETE",
				]),
				voucherId: z.string().optional(),
				body: z.unknown().optional(),
			},
		},
		async ({
			consoleId,
			siteId,
			method,
			voucherId,
			body,
		}) => {
			const path =
				`/v1/sites/${encodeURIComponent(siteId)}/hotspot/vouchers` +
				(voucherId
					? `/${encodeURIComponent(voucherId)}`
					: "");

			const result = await unifiRequest(
				env,
				networkApiBase(consoleId),
				path,
				method,
				body,
			);

			return jsonResult(result);
		},
	);

	return server;
}

export default {
	fetch(request: Request, env: UnifiEnv, ctx: ExecutionContext) {
		return createMcpHandler(
			() => createServer(env),
		)(request, env, ctx);
	},
} satisfies ExportedHandler<UnifiEnv>;
