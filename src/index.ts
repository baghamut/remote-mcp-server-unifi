import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

type UnifiEnv = {
	UNIFI_API_KEY: string;
};

const UNIFI_API = "https://api.ui.com";

async function unifiGet(
	env: UnifiEnv,
	path: string,
): Promise<unknown> {
	const response = await fetch(`${UNIFI_API}${path}`, {
		method: "GET",
		headers: {
			Accept: "application/json",
			"X-API-Key": env.UNIFI_API_KEY,
		},
	});

	const text = await response.text();

	if (!response.ok) {
		throw new Error(
			`UniFi API ${response.status}: ${text}`,
		);
	}

	return JSON.parse(text);
}

function createServer(env: UnifiEnv) {
	const server = new McpServer({
		name: "UniFi Site Manager",
		version: "1.0.0",
	});

	server.registerTool(
		"unifi_list_sites",
		{
			description:
				"List all UniFi sites available through the Site Manager API.",
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
			const result = await unifiGet(
				env,
				`/v1/sites${query ? `?${query}` : ""}`,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	server.registerTool(
		"unifi_list_hosts",
		{
			description:
				"List all UniFi consoles/hosts available through the Site Manager API.",
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
			const result = await unifiGet(
				env,
				`/v1/hosts${query ? `?${query}` : ""}`,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
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
			const result = await unifiGet(
				env,
				`/v1/hosts/${encodeURIComponent(id)}`,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
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
			const result = await unifiGet(
				env,
				`/v1/devices${query ? `?${query}` : ""}`,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	return server;
}

export default {
	fetch(request: Request, env: UnifiEnv, ctx: ExecutionContext) {
		return createMcpHandler(() => createServer(env))(
			request,
			env,
			ctx,
		);
	},
} satisfies ExportedHandler<UnifiEnv>;
