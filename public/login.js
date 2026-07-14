const form = document.querySelector('#login-form');
const button = document.querySelector('#login-button');
const error = document.querySelector('#error');

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Sign in could not be completed.');
  return data;
}

try {
  await request('/auth/session');
  window.location.replace('/');
} catch {
  // The normal unauthenticated state stays on the sign-in page.
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  button.disabled = true;
  button.textContent = 'Signing in...';
  try {
    await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.elements.username.value,
        password: form.elements.password.value,
      }),
    });
    window.location.replace('/');
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in securely';
  }
});
