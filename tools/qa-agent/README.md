# QA 탐험 에이전트 툴

브라우저 없이, HTTP + WebSocket으로 직접 게임 세션을 조작하는 스크립트 클라이언트.
"뭘 해볼지"에 대한 판단은 이 툴이 아니라 이걸 부리는 AI 에이전트가 매 턴 한다 —
`qa-client.js`는 그 에이전트가 명령을 보내고 서버 응답을 읽을 수 있게 해주는
얇은 도구일 뿐이다 (`TODO.md`의 "QA 탐험 봇" 항목 참고).

## 실행 방법 (사람이 에이전트에게 시킬 때)

이 봇은 실행 파일이 아니라 **AI 에이전트가 이 문서를 읽고 스스로 진행하는 절차**다.
Claude Code든 다른 코딩 에이전트든, 새 세션(가능하면 이 저장소를 열어둔 상태)에서
아래 프롬프트를 그대로 주면 된다:

> `tools/qa-agent/README.md`를 읽고, 거기 적힌 절차대로 게임 서버를 QA 탐험해줘.
> 계정을 만들고 캐릭터를 키우면서 다양한 명령을 시도해보고, 이상한 점을 발견하면
> 재현 절차를 확인한 뒤 제안 게시판에 등록해줘. 서버가 이미 떠 있는지 확인하고
> (안 떠 있으면 알려줘), 몇 개의 계정/여러 직업으로 돌아보면 좋겠어.

에이전트는 이 문서만 보고 `qa-client.js`의 서브커맨드, 권장 진행 순서, 서버
주소 설정법(`QA_SERVER_URL`)까지 전부 파악할 수 있어야 한다 — 그게 이 문서의
목적이다. 별도로 커맨드를 하나하나 알려줄 필요는 없다.

## 기본 사용법

```bash
node tools/qa-agent/qa-client.js register qatester1 testpass1234
node tools/qa-agent/qa-client.js create-character qatester1 탐험가 wood warrior
node tools/qa-agent/qa-client.js send qatester1 "look"
node tools/qa-agent/qa-client.js send qatester1 "north"
node tools/qa-agent/qa-client.js send qatester1 "attack 고블린"
node tools/qa-agent/qa-client.js suggest qatester1 "물약 사용 시 수량 표시 오류" "가죽 물약 x2를 사용했는데 x1이 아니라 x0으로 표시됨. 재현: ..."
```

- 계정당 세션(토큰)은 `tools/qa-agent/.sessions/<username>.json`에 저장된다 (git에는 안 올라감).
- `send`는 텍스트 명령(`look`, `north`, `attack <이름>`, `magic <스킬> <대상>`, `use <아이템>`,
  `shop`, `buy <아이템>`, `skill learn <이름>` 등 서버가 인식하는 모든 명령)을 보내고, 짧은 시간
  (기본 1200ms) 동안 서버가 보내는 응답을 전부 모아 JSON 배열로 출력한다.
- 텍스트 명령으로 안 되는 것(장비 착용 슬롯 지정, 인벤토리 id로 아이템 사용 등 클라이언트
  UI 전용 메시지)은 `raw`로 원본 `ClientMessage` JSON을 직접 보낼 수 있다. 예:
  `node qa-client.js raw qatester1 '{"type":"useItem","inventoryId":12}'`

## 에이전트가 QA 탐험할 때 진행 방식 (권장)

1. `register`로 새 계정을 만들고 `create-character`로 캐릭터를 만든다. 직업/속성은
   매번 다르게 골라서 여러 조합을 커버하는 게 좋다.
2. `send ... "look"`으로 방을 확인하고, 이동/전투/상점/스킬/아이템 사용 등을 다양하게
   시도하면서 매 응답을 관찰한다.
3. 이상 신호를 발견하면(서버가 `{"type":"error"}`를 예상 밖에 보냄, 수치가 말이 안 됨,
   메시지가 깨져 보임, 상태가 갱신 안 됨, 연결이 끊김 등) 재현 절차를 정확히 기록해둔다.
4. 재현이 확인되면 `suggest`로 제안 게시판에 등록한다. 제목은 짧고 구체적으로, 내용에는
   재현 절차(어떤 명령을 어떤 순서로 보냈는지)와 실제/기대 결과를 반드시 포함한다.
5. 테스트용으로 만든 계정은 실제 플레이어 데이터가 아니므로, 끝나면 정리해도 되고
   (DB에서 직접 지우거나 그대로 둬도 게임에 지장은 없다) 굳이 안 지워도 된다 — 단,
   `admin`처럼 실제 사용자가 쓰는 계정은 절대 건드리지 않는다.

## 참고

- 서버 주소는 기본 `http://localhost:3001`이며 `QA_SERVER_URL` 환경변수로 바꿀 수 있다.
- 이 툴 자체는 무엇이 버그인지 판단하지 않는다 — 판단과 서술은 이 툴을 부리는 에이전트의 몫이다.
