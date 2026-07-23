# Fuji Flush

3~8명이 플레이하는 핸드 셰딩 카드 게임. 손패를 가장 먼저 모두 없애면 승리.

## 현재 상태

- 게임 엔진 + 단위 테스트 완료.
- 두 가지 플레이 모드 구현 완료:
  - **혼자하기 (AI 상대)**: `npm run dev` 로 Vite 개발 서버를 띄우고 브라우저에서 바로 플레이.
  - **온라인 멀티플레이**: `npm run build` 후 `npm run server` 로 Node 서버를 띄우면 같은 주소로
    여러 사람이 접속 가능 (아직 로컬/LAN 전용, 인터넷 배포는 아래 TODO 참고).
- `npm test` 로 테스트, `npm run typecheck` 로 타입 체크.

## 구조

- `src/engine/` — 게임 규칙 (수정 없음, 두 모드가 그대로 재사용)
  - `types.ts`, `deck.ts`, `gameEngine.ts` (`createGame`/`playCard`/`getActiveGroups`)
  - `playerView.ts` — `toPlayerView(state, viewerId)`: 손패를 본인 것만 보여주고 나머지는
    장수만 노출하는 뷰. 로컬 모드(봇 손패 숨기기)와 서버(실제 보안 경계) 둘 다 이 함수 하나로 처리.
- `src/ai/botPlayer.ts` — `chooseBotMove(state, playerId)`. `playCard`를 순수 dry-run
  시뮬레이터로 사용해 각 후보 카드를 시험해보고, 안전한 카드 중 가장 낮은 걸 내거나(안전한 게
  없으면 결과 총합이 가장 높은 걸) 선택. 규칙 판정 로직은 전혀 재구현하지 않음.
- `src/shared/protocol.ts` — 클라이언트/서버 WebSocket 메시지 타입 (`ClientMessage`/`ServerMessage`).
- `src/server/` — 온라인 멀티플레이 서버 (Express + `ws`, `tsx`로 실행)
  - `server.ts` — `dist/` 정적 파일 서빙 + `/ws` 경로로 WebSocket 업그레이드, 한 포트로 통합.
  - `rooms.ts` — 방/로비 상태를 메모리에 `Map`으로 보관. 서버가 유일하게 `createGame`/`playCard`를
    호출하는 주체 (클라이언트는 절대 게임 상태를 직접 계산하지 않음). 모든 브로드캐스트는 플레이어별로
    `toPlayerView`를 따로 계산해서 보냄 — 절대 하나의 공유 상태를 그대로 뿌리지 않음.
  - `roomCode.ts` — 5자리 방 코드 생성 (혼동되는 0/O, 1/I 제외).
- `src/client/` — 프론트엔드 (기존 `src/ui/`를 대체)
  - `main.ts` — 모드 선택 화면 → `localMode`/`networkMode`로 위임.
  - `render.ts` — `PlayerFacingState`를 받아 보드를 그리는 순수 렌더 함수 (두 모드가 공유).
  - `localMode.ts` — 로컬 `GameState` 보유, 봇 턴은 500ms 딜레이로 한 수씩 진행.
  - `networkMode.ts` — 방 만들기/참가 로비 화면 + WebSocket 클라이언트. 카드 클릭 시 서버에
    `playCard` 메시지만 보내고, 다음 `stateUpdate`가 올 때까지 버튼을 비활성화 (낙관적 UI 없음).

## 핵심 설계 결정

- **그룹(Joining Forces)은 상태로 저장하지 않고 매번 계산한다.** `activeCards`를 raw `value`로
  묶으면 그룹이 결정되므로 `groupId`는 `group-<value>`로 매번 새로 유도. 과거 이력을 들고 다닐
  필요가 없어 동기화 버그 위험이 없음.
- **Player에 `activeCards` 필드를 두지 않았다.** `GameState.activeCards`가 이미 `playerId`로
  추적하므로 중복 저장하면 두 값이 어긋날 위험만 생김.
- **`playCard(state, playerId, cardId?)`에서 `cardId`는 optional.** 손패 0장인 채로 자기 차례가
  됐는데 이전에 낸 카드가 Pushed Through되며 바로 승리하는 경우(규칙 14)가 있어서, 낼 카드가
  없어도 턴이 정상 종료돼야 함.
- **`getActiveGroups`는 `GameState`가 아니라 `ActiveCard[]`를 받는다.** 그래야 손패 정보가 없는
  `PlayerFacingState.activeCards`에도 같은 함수를 그대로 재사용할 수 있음 (그룹 계산 로직 중복 방지).
- **손패 숨김은 `toPlayerView` 하나로 통일.** 로컬 모드의 "봇 손패 숨기기"는 단순 연출이지만,
  서버의 "다른 사람 손패 숨기기"는 실제 보안 경계임 — 같은 함수를 재사용해서 두 맥락에서 동일하게
  검증됨.
- **온라인 방 목록은 서버 메모리에만 존재한다.** 서버가 재시작되면 모든 방/게임이 사라짐. 무료
  호스팅(Render.com 등)은 안 쓰면 잠들었다가 재시작될 수 있으므로 알려진 제약으로 남겨둠 (지금
  당장 고치지 않기로 결정).
- **재접속(reconnect)은 의도적으로 구현하지 않았다.** 게임 중 탭이 새로고침되거나 연결이 끊기면
  그 자리는 복구할 방법이 없음. 나중에 할 일로 남겨둠 (아래 TODO 참고).

## 다음 할 일

- **Git 저장소 설정 + GitHub 배포.** 아직 git init 안 함. 인터넷 어디서든 접속 가능한 멀티플레이를
  위해서는 git 저장소 → GitHub → Render.com(무료 플랜) 배포가 필요함. 배포 시 Build Command:
  `npm install && npm run build`, Start Command: `npm run start`.
- **재접속 지원.** 브라우저 새로고침/연결 끊김 시 같은 자리로 복귀할 수 있게 하려면 플레이어별
  재접속 토큰을 발급해 `localStorage`에 저장하고, 재연결 시 그 토큰으로 같은 좌석에 매핑해야 함.
- **로컬 개발 시 멀티플레이 테스트 흐름**: `npm run build` → `npm run server` → 브라우저 탭 여러
  개(또는 같은 와이파이의 다른 기기에서 내 PC의 LAN IP로 접속)로 확인. 이 경로는 핫 리로드가 없어서
  코드 바꿀 때마다 다시 build해야 함 — 나중에 `vite.config.ts`에 `/ws` 프록시를 추가하면 개선 가능
  (지금은 안 함).
