import './style.css';
import { createCharacter, fetchMe, login, register } from './api';
import { renderCharacterCreateScreen } from './ui/characterCreateScreen';
import { renderGameScreen } from './ui/gameScreen';
import { renderLoginScreen } from './ui/loginScreen';

const TOKEN_KEY = 'mud_token';
const app = document.querySelector<HTMLDivElement>('#app')!;

async function start(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    showLogin();
    return;
  }

  try {
    const me = await fetchMe(token);
    if (me.character) {
      renderGameScreen(app, token, me.isBuilder, me.isAdmin);
    } else {
      showCharacterCreate(token);
    }
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }
}

function showLogin(): void {
  renderLoginScreen(app, {
    onLogin: async (username, password) => {
      const { token } = await login(username, password);
      localStorage.setItem(TOKEN_KEY, token);
      await start();
    },
    onRegister: async (username, password) => {
      const { token } = await register(username, password);
      localStorage.setItem(TOKEN_KEY, token);
      await start();
    },
  });
}

function showCharacterCreate(token: string): void {
  renderCharacterCreateScreen(app, {
    onCreate: async (name, element) => {
      await createCharacter(token, name, element);
      await start();
    },
  });
}

void start();
