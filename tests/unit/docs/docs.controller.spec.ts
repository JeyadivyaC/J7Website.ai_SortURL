import { DocsController } from '../../../src/docs/docs.controller';

describe('DocsController', () => {
  const controller = new DocsController();

  it('serves openapi.yaml from the service root', () => {
    const result = controller.getOpenApiSpec();
    expect(result).toContain('openapi: 3.0.3');
    expect(result).toContain('title: J7Website Short URL Service');
  });

  it('serves swagger-ui.html from the service root', () => {
    const result = controller.getSwaggerUi();
    expect(result).toContain('<title>J7Website Short URL API</title>');
    expect(result).toContain("url: './openapi.yaml'");
  });
});
