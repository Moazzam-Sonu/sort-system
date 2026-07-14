export function invalidJsonHandler(error, request, response, next) {
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'Request data is invalid.' });
    return;
  }
  next(error);
}

export function unhandledErrorHandler(error, request, response, next) {
  console.error(error);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
}
