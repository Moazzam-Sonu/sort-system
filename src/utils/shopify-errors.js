export function formatUserErrors(userErrors) {
  return userErrors.map((error) => {
    const fieldPath = Array.isArray(error.field) ? error.field.join('.') : error.field;
    return fieldPath ? `${fieldPath}: ${error.message}` : error.message;
  }).join('; ');
}
