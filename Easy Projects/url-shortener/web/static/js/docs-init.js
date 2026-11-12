if (window.SwaggerUIBundle) {
  document.getElementById('fallback').hidden = true;
  window.SwaggerUIBundle({
    url: '/docs/openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: false,
    persistAuthorization: false,
  });
}
