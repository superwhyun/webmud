import {
  ELEMENT_LABELS,
  ELEMENT_VALUES,
  JOB_DESCRIPTIONS,
  JOB_LABELS,
  JOB_VALUES,
  type ElementType,
  type JobType,
} from '@mud/shared';

export interface CharacterCreateCallbacks {
  onCreate: (name: string, element: ElementType, job: JobType) => Promise<void>;
}

export function renderCharacterCreateScreen(
  container: HTMLElement,
  callbacks: CharacterCreateCallbacks,
): void {
  const elementOptions = ELEMENT_VALUES.map(
    (value) => `<option value="${value}">${ELEMENT_LABELS[value]}</option>`,
  ).join('');
  const jobOptions = JOB_VALUES.map(
    (value) => `<option value="${value}">${JOB_LABELS[value]} — ${JOB_DESCRIPTIONS[value]}</option>`,
  ).join('');

  container.innerHTML = `
    <div class="auth-screen">
      <h1>캐릭터 생성</h1>
      <form id="character-form" class="auth-form">
        <input
          id="character-name"
          type="text"
          placeholder="캐릭터 이름"
          autocomplete="off"
          required
          aria-label="캐릭터 이름"
        />
        <select id="character-element" aria-label="속성 선택">${elementOptions}</select>
        <select id="character-job" aria-label="직업 선택">${jobOptions}</select>
        <div class="auth-actions">
          <button type="submit">모험 시작</button>
        </div>
        <p class="auth-error" id="character-error"></p>
      </form>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#character-form')!;
  const nameInput = container.querySelector<HTMLInputElement>('#character-name')!;
  const elementSelect = container.querySelector<HTMLSelectElement>('#character-element')!;
  const jobSelect = container.querySelector<HTMLSelectElement>('#character-job')!;
  const errorEl = container.querySelector<HTMLParagraphElement>('#character-error')!;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const element = elementSelect.value as ElementType;
    const job = jobSelect.value as JobType;
    void callbacks.onCreate(nameInput.value, element, job).catch((error: unknown) => {
      errorEl.textContent = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    });
  });
}
