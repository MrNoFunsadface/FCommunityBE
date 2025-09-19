import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "FCommunity API",
      version: "1.0.0",
      description: "API documentation for FCommunity",
    },
    servers: [
      {
        url: "http://localhost:3000/api",
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  // Path to your API docs
  apis: ["./src/app/api/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
