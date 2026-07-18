import { Controller, Get, Header } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

// Serves the repo's own openapi.yaml/swagger-ui.html from the deployed API
// itself - so sharing the API with someone (Postman's "Link" import,
// Swagger UI in a browser, no local checkout needed) is just a URL, not a
// file to pass around. process.cwd() resolves correctly in both
// environments: the Lambda runtime's working directory is the artifact
// root (see Makefile - both files are copied there alongside dist/), and
// local dev's is this service's own root - both are exactly where these two
// files live.
@Controller()
export class DocsController {
  @Get('openapi.yaml')
  @Header('Content-Type', 'text/yaml; charset=utf-8')
  getOpenApiSpec(): string {
    return readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf-8');
  }

  @Get('swagger-ui.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getSwaggerUi(): string {
    return readFileSync(join(process.cwd(), 'swagger-ui.html'), 'utf-8');
  }
}
