/**
 * OpenAPI 3.1.0 Schema for Qentrax v2
 * Complete API documentation covering all endpoints
 */

export const openAPISchema = {
  openapi: "3.1.0",
  info: {
    title: "Qentrax v2 API",
    version: "2.0.0",
    description:
      "Marketplace routing engine with webhook delivery, conversion tracking, and MCP integration",
    contact: {
      name: "Qentrax Support",
      email: "support@qentrax.com",
    },
  },
  servers: [
    {
      url: "https://api.qentrax.com",
      description: "Production",
    },
    {
      url: "http://localhost:3000",
      description: "Development",
    },
  ],
  paths: {
    "/api/v1/ping": {
      post: {
        summary: "Submit a lead ping",
        description:
          "Minimal data submission → validation → auction → return best bid + transaction ID. Idempotent on (source_id, external_submission_id).",
        operationId: "submitPing",
        tags: ["Routing"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["source_id", "external_submission_id", "vertical"],
                properties: {
                  source_id: {
                    type: "string",
                    description: "Unique identifier for the lead source",
                  },
                  external_submission_id: {
                    type: "string",
                    description: "External system's submission ID for idempotency",
                  },
                  vertical: {
                    type: "string",
                    description: "Vertical market (e.g., auto, solar, home-services)",
                  },
                  product: {
                    type: ["string", "null"],
                    description: "Optional product type within vertical",
                  },
                  consumer: {
                    type: "object",
                    description: "Consumer demographic data",
                    properties: {
                      phone: { type: "string" },
                      email: { type: "string" },
                      zip_code: { type: "string" },
                      state: { type: "string" },
                    },
                  },
                  attributes: {
                    type: "object",
                    description: "Custom attributes for auction targeting",
                  },
                  consent: {
                    type: "object",
                    description: "Consent information (method, timestamp)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Ping accepted, auction completed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        public_transaction_id: { type: "string" },
                        best_bid: { type: "number" },
                        bid_expires_at: { type: "string", format: "date-time" },
                        campaign_id: { type: "string" },
                      },
                    },
                    request_id: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: false },
                    error_code: { type: "string" },
                    error_message: { type: "string" },
                    request_id: { type: "string" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Authentication required",
          },
        },
      },
    },
    "/api/v1/post": {
      post: {
        summary: "Accept ping bid and deliver to buyer",
        description:
          "Accept a ping bid, deliver to advertiser, create budget reservation. Idempotent on (public_transaction_id, source_id, external_submission_id).",
        operationId: "submitPost",
        tags: ["Routing"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "public_transaction_id",
                  "source_id",
                  "external_submission_id",
                  "consumer",
                  "attributes",
                ],
                properties: {
                  public_transaction_id: {
                    type: "string",
                    description: "Transaction ID from ping response",
                  },
                  source_id: { type: "string" },
                  external_submission_id: { type: "string" },
                  consumer: {
                    type: "object",
                    description: "Updated consumer information",
                  },
                  attributes: {
                    type: "object",
                    description: "Updated attributes",
                  },
                  consent: {
                    type: "object",
                    description: "Consent confirmation",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Post accepted, delivery sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        delivery_id: { type: "string" },
                        campaign_id: { type: "string" },
                        delivery_status: { type: "string" },
                        acceptance_deadline: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/v1/conversions": {
      get: {
        summary: "List conversion events",
        description: "Retrieve conversion events with filtering and pagination",
        operationId: "listConversions",
        tags: ["Conversions"],
        parameters: [
          {
            name: "organization_id",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Organization ID (tenant isolation)",
          },
          {
            name: "delivery_id",
            in: "query",
            schema: { type: "string" },
            description: "Filter by delivery ID",
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["qualified", "rejected", "pending"],
            },
            description: "Filter by conversion status",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20 },
            description: "Results per page",
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
            description: "Pagination offset",
          },
        ],
        responses: {
          "200": {
            description: "List of conversions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          delivery_id: { type: "string" },
                          transaction_id: { type: "string" },
                          organization_id: { type: "string" },
                          conversion_status: { type: "string" },
                          conversion_value: { type: "number" },
                          created_at: { type: "string", format: "date-time" },
                        },
                      },
                    },
                    count: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required organization_id" },
          "500": { description: "Server error" },
        },
      },
      post: {
        summary: "Record a conversion event",
        description: "Record single or bulk conversion events",
        operationId: "recordConversion",
        tags: ["Conversions"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    required: [
                      "organization_id",
                      "delivery_id",
                      "transaction_id",
                      "conversion_status",
                    ],
                    properties: {
                      organization_id: { type: "string" },
                      delivery_id: { type: "string" },
                      transaction_id: { type: "string" },
                      conversion_status: {
                        type: "string",
                        enum: ["qualified", "rejected", "pending"],
                      },
                      conversion_value: { type: "number" },
                      event_type: { type: "string" },
                      external_conversion_id: { type: "string" },
                    },
                  },
                  {
                    type: "object",
                    required: ["organization_id", "bulk", "conversions"],
                    properties: {
                      organization_id: { type: "string" },
                      bulk: { type: "boolean", enum: [true] },
                      conversions: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Conversion recorded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required fields" },
          "500": { description: "Server error" },
        },
      },
    },
    "/api/v1/conversions/organization-metrics": {
      get: {
        summary: "Get organization-level conversion metrics",
        description: "Retrieve aggregated metrics for an organization",
        operationId: "getOrgMetrics",
        tags: ["Metrics"],
        parameters: [
          {
            name: "organization_id",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "start_date",
            in: "query",
            schema: { type: "string", format: "date" },
          },
          {
            name: "end_date",
            in: "query",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          "200": {
            description: "Organization metrics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    organization_id: { type: "string" },
                    total_deliveries: { type: "integer" },
                    total_conversions: { type: "integer" },
                    conversion_rate: { type: "number" },
                    total_revenue: { type: "number" },
                    average_value: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/conversions/campaign-metrics": {
      get: {
        summary: "Get campaign-level conversion metrics",
        description: "Retrieve metrics by campaign",
        operationId: "getCampaignMetrics",
        tags: ["Metrics"],
        parameters: [
          {
            name: "organization_id",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "campaign_id",
            in: "query",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Campaign metrics array",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      campaign_id: { type: "string" },
                      conversions: { type: "integer" },
                      revenue: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/conversions/connector-metrics": {
      get: {
        summary: "Get metrics by connector/integration",
        description: "Retrieve performance by integration source",
        operationId: "getConnectorMetrics",
        tags: ["Metrics"],
        parameters: [
          {
            name: "organization_id",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Connector metrics",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      connector_id: { type: "string" },
                      connector_name: { type: "string" },
                      conversions: { type: "integer" },
                      revenue: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/requirements": {
      get: {
        summary: "Get market vertical requirements",
        description: "Retrieve validation rules for a vertical market",
        operationId: "getRequirements",
        tags: ["Market Data"],
        parameters: [
          {
            name: "vertical",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Vertical requirements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    vertical: { type: "string" },
                    required_fields: { type: "array", items: { type: "string" } },
                    consent_methods: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/crm/integrations": {
      get: {
        summary: "List CRM integrations",
        description: "Retrieve configured CRM integrations for organization",
        operationId: "listIntegrations",
        tags: ["Integrations"],
        parameters: [
          {
            name: "organization_id",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "List of integrations",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      organization_id: { type: "string" },
                      connector_type: { type: "string" },
                      config: { type: "object" },
                      created_at: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create CRM integration",
        description: "Register a new CRM integration",
        operationId: "createIntegration",
        tags: ["Integrations"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["organization_id", "connector_type"],
                properties: {
                  organization_id: { type: "string" },
                  connector_type: {
                    type: "string",
                    enum: ["zapier", "make", "sftp"],
                  },
                  config: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Integration created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/crm/integrations/{id}": {
      get: {
        summary: "Get integration details",
        operationId: "getIntegration",
        tags: ["Integrations"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Integration details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    organization_id: { type: "string" },
                    connector_type: { type: "string" },
                    config: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
      put: {
        summary: "Update integration",
        operationId: "updateIntegration",
        tags: ["Integrations"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  config: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Integration updated" },
        },
      },
    },
    "/api/v1/crm/integrations/{id}/sync": {
      post: {
        summary: "Trigger integration sync",
        operationId: "syncIntegration",
        tags: ["Integrations"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Sync initiated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sync_id: { type: "string" },
                    status: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/crm/zapier/webhook": {
      post: {
        summary: "Zapier webhook endpoint",
        description: "Receive conversion data from Zapier",
        operationId: "zapierWebhook",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  organization_id: { type: "string" },
                  delivery_id: { type: "string" },
                  status: { type: "string" },
                  data: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Webhook received",
          },
        },
      },
    },
    "/api/v1/crm/make/webhook": {
      post: {
        summary: "Make.com webhook endpoint",
        description: "Receive conversion data from Make.com",
        operationId: "makeWebhook",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Webhook received",
          },
        },
      },
    },
    "/api/v1/crm/sftp/upload": {
      post: {
        summary: "SFTP file upload endpoint",
        description: "Receive bulk conversion data via SFTP",
        operationId: "sftpUpload",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                  },
                  organization_id: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "File uploaded and processed",
          },
        },
      },
    },
    "/api/v1/simulations/what-if": {
      post: {
        summary: "Run what-if simulation",
        description: "Test auction outcome without recording transaction",
        operationId: "whatIfSimulation",
        tags: ["Simulations"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  vertical: { type: "string" },
                  product: { type: "string" },
                  consumer: { type: "object" },
                  attributes: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Simulation result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    winner: { type: "string" },
                    winning_bid: { type: "number" },
                    runner_up_bid: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          error_code: { type: "string" },
          error_message: { type: "string" },
          request_id: { type: "string" },
        },
      },
      Transaction: {
        type: "object",
        properties: {
          id: { type: "string" },
          organization_id: { type: "string" },
          public_id: { type: "string" },
          source_id: { type: "string" },
          external_submission_id: { type: "string" },
          vertical: { type: "string" },
          status: {
            type: "string",
            enum: ["pinged", "posted", "delivered", "charged", "converted"],
          },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Delivery: {
        type: "object",
        properties: {
          id: { type: "string" },
          transaction_id: { type: "string" },
          campaign_id: { type: "string" },
          organization_id: { type: "string" },
          status: {
            type: "string",
            enum: ["pending", "delivered", "accepted", "rejected", "failed"],
          },
          attempts: { type: "integer" },
          last_error: { type: "string" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Conversion: {
        type: "object",
        properties: {
          id: { type: "string" },
          delivery_id: { type: "string" },
          transaction_id: { type: "string" },
          organization_id: { type: "string" },
          status: {
            type: "string",
            enum: ["qualified", "rejected", "pending"],
          },
          conversion_value: { type: "number" },
          created_at: { type: "string", format: "date-time" },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Supabase JWT token from auth.getClaims()",
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    {
      name: "Routing",
      description: "Lead ping and auction operations",
    },
    {
      name: "Conversions",
      description: "Conversion tracking and recording",
    },
    {
      name: "Metrics",
      description: "Analytics and performance metrics",
    },
    {
      name: "Integrations",
      description: "CRM and platform integrations",
    },
    {
      name: "Webhooks",
      description: "Webhook receivers for external integrations",
    },
    {
      name: "Simulations",
      description: "Testing and simulation endpoints",
    },
    {
      name: "Market Data",
      description: "Vertical requirements and market data",
    },
  ],
};
