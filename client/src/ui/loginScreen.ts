export interface LoginScreenCallbacks {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
}

export function renderLoginScreen(container: HTMLElement, callbacks: LoginScreenCallbacks): void {
  container.innerHTML = `
    <div class="auth-screen">
      <h1>MUD</h1>
      <form id="auth-form" class="auth-form">
        <input id="username" type="text" placeholder="아이디" autocomplete="username" required aria-label="아이디" value="admin" />
        <input
          id="password"
          type="password"
          placeholder="비밀번호"
          autocomplete="current-password"
          required
          aria-label="비밀번호"
          value="admin1234"
        />
        <div class="auth-actions">
          <button type="submit">로그인</button>
          <button type="button" id="register-btn">회원가입</button>
        </div>
        <p class="auth-error" id="auth-error"></p>
      </form>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#auth-form')!;
  const usernameInput = container.querySelector<HTMLInputElement>('#username')!;
  const passwordInput = container.querySelector<HTMLInputElement>('#password')!;
  const errorEl = container.querySelector<HTMLParagraphElement>('#auth-error')!;
  const registerBtn = container.querySelector<HTMLButtonElement>('#register-btn')!;

  async function withErrorHandling(action: () => Promise<void>): Promise<void> {
    errorEl.textContent = '';
    try {
      await action();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void withErrorHandling(() => callbacks.onLogin(usernameInput.value, passwordInput.value));
  });

  registerBtn.addEventListener('click', () => {
    void withErrorHandling(() => callbacks.onRegister(usernameInput.value, passwordInput.value));
  });
}
