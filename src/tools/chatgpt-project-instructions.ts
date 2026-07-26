import { GetChatGPTProjectInstructionsArgsSchema } from './schemas.js';
import type { ServerResult } from '../types.js';

const PROJECT_NAME = '[PROJECT_NAME]';
const GITHUB_REPOSITORY = '[REPOSITORY_OWNER/REPOSITORY_NAME]';
const WORKSPACE_ROOT = '[WORKSPACE_ROOT]';
const WRITING_START = ':::writing{variant="document"}';
const WRITING_END = ':::';

const CHATGPT_PROJECT_INSTRUCTIONS_TEMPLATE = `# 프로젝트 기본 정보

- 프로젝트 이름: ${PROJECT_NAME}
- GitHub 저장소: ${GITHUB_REPOSITORY}
- 기본 로컬 작업공간: ${WORKSPACE_ROOT}

# 기본 작업 원칙

- 이 프로젝트의 기본 로컬 작업공간은 ${WORKSPACE_ROOT}이다.
- ${WORKSPACE_ROOT} 및 그 하위 경로에 필요한 파일 조회, 파일 수정, 디렉터리 생성, 빌드, 테스트 및 Git 작업 권한을 승인한다.
- 저장소의 기본 브랜치, 현재 브랜치, HEAD SHA, 작업 트리 상태 및 원격 저장소는 입력값으로 추정하지 않고 실제 Git 상태에서 확인한다.
- 지정된 작업공간 밖에서 파일을 수정하거나 파괴적인 명령을 실행해야 할 경우에는 먼저 사용자에게 확인한다.
- 사용자가 진행 중인 변경이나 다른 세션에서 만들어진 변경을 임의로 초기화하거나 덮어쓰거나 삭제하지 않는다.
- 출처가 불분명한 변경이 발견되면 현재 상태를 보존하고 충돌 가능성을 먼저 보고한다.
- 사용자가 조사나 확인만 요청한 경우에는 파일을 수정하지 않는다.

# 프로젝트 전역 지침의 역할

- 이 프로젝트 전역 지침을 웹 ChatGPT가 Remote 플러그인 또는 Local MCP를 통해 로컬 작업할 때 적용하는 1차 가드레일로 사용한다.
- Remote 플러그인 또는 Local MCP가 저장소의 AGENTS.md를 Codex CLI처럼 자동으로 읽거나 프롬프트에 주입한다고 가정하지 않는다.
- 로컬 Codex CLI 사용 제한을 적용하기 위한 목적으로 AGENTS.md를 자동 생성하거나 수정하지 않는다.
- 저장소에 기존 AGENTS.md가 있고 그 내용을 작업에 적용해야 하는 경우에는 웹 ChatGPT가 Remote 파일 도구로 직접 읽은 뒤 적용한다.
- AGENTS.md를 읽지 않았거나 Local MCP 서버가 내부적으로 파일에 접근했다는 사실만으로 해당 지침을 확인했다고 간주하지 않는다.
- 시스템 지침, 사용자의 현재 요청, 프로젝트 전역 지침 및 실제로 읽은 저장소 지침이 충돌할 경우에는 우선순위가 높은 지침을 따른다.

# ChatGPT 작업 실행 방식

- 이 프로젝트에서 웹 ChatGPT가 Remote 플러그인 또는 Local MCP를 통해 수행하는 구현 작업은 현재 웹 ChatGPT 세션에서 Inline Execution 방식으로 직접 수행한다.
- 구현 계획 실행, 병렬 처리 또는 역할 분리를 위해 사용자의 로컬 Codex CLI를 하위 작업자나 Subagent로 호출하지 않는다.
- 사용자가 단순히 “Subagent”, “병렬 에이전트” 또는 “별도 에이전트”를 요청하더라도 이를 로컬 Codex CLI 실행 요청으로 자동 해석하지 않는다.
- 웹 ChatGPT 내부의 병렬 처리 기능과 사용자의 로컬 Codex CLI는 서로 다른 실행 환경으로 취급한다.
- 실행 방식의 경계가 불명확하면 로컬 Codex CLI를 사용하지 않고 현재 웹 ChatGPT 세션의 Inline Execution으로 진행한다.
- Remote 또는 Local MCP에서 사용할 수 없는 기능을 로컬 Codex CLI로 대체하지 않는다.

# ChatGPT에서의 로컬 Codex CLI 제한

- 이 제한은 웹 ChatGPT, Remote 플러그인 또는 Local MCP가 시작한 작업에 적용한다.
- 웹 ChatGPT는 사용자의 로컬 Codex CLI와 로컬 Codex 구독 사용량을 사용하지 않는다.
- 웹 ChatGPT는 일반적인 Codex CLI 직접 실행, 공식 Codex 패키지 실행 또는 Codex 실행 파일을 셸로 지정하는 작업을 요청하거나 수행하지 않는다.
- 제한 대상의 대표적인 형태에는 codex, codex exec, codex review, codex.exe, codex.cmd, codex.ps1, npx @openai/codex, npx -y @openai/codex, npx --yes @openai/codex, npm exec -- @openai/codex 및 npm x -- @openai/codex가 포함된다.
- 셸, 스크립트, 패키지 런처, 별칭, wrapper 또는 다른 프로그램을 이용해 이 제한을 의도적으로 우회하지 않는다.
- 기존 대화형 셸이나 프로세스를 시작한 뒤 입력을 전송하여 Codex CLI를 간접 실행하지 않는다.
- Local MCP가 Codex CLI 호출을 거부하면 명령 문자열을 변형하거나 다른 실행 경로를 사용하여 재시도하지 않는다.
- 거부 메시지는 현재 작업을 중단하라는 의미가 아니라, 로컬 Codex 대신 현재 웹 ChatGPT 세션의 Inline Execution으로 계속하라는 안내로 해석한다.
- 이 제한은 Codex CLI에만 적용한다.
- 사용자의 별도 지시 없이 Claude, Gemini, Aider, OpenCode 또는 다른 명령줄 도구를 동일한 금지 대상으로 자동 확장하지 않는다.

# Local MCP V2의 Codex reminder 범위

- Local MCP V2의 Codex reminder는 웹 ChatGPT가 일반적인 방식으로 로컬 Codex CLI를 실수로 실행하는 상황을 막기 위한 2차 가드레일이다.
- 이 기능을 완전한 보안 경계, 샌드박스 또는 악의적인 우회 방지 기능으로 간주하지 않는다.
- 현재 V2는 start_process 요청에서 명령 앞부분에 나타나는 명백한 Codex 직접 실행과 정해진 npm 또는 npx 실행 형태를 느슨하게 감지한다.
- 명시적 또는 기본 셸 실행 파일 자체가 Codex 실행 파일인 경우에도 실행을 거부할 수 있다.
- 거부 시 로컬 Codex 실행이 수행되지 않았다는 사실과 현재 웹 ChatGPT 세션의 Inline Execution으로 계속해야 한다는 이유를 반환한다.
- 다음 영역까지 분석하도록 기능 범위를 자동 확장하지 않는다.
  - 복잡한 셸 문법
  - 연결된 여러 명령
  - 여러 줄 명령의 후속 명령
  - 환경 변수 접두사
  - 별칭과 셸 함수
  - 일반 wrapper와 사용자 스크립트
  - 동적으로 생성된 명령
  - 모든 패키지 버전 표현
  - 기존 대화형 프로세스에 전달되는 모든 입력
  - 실행 중인 프로세스의 출처와 세션 상태
- 감지되지 않는 간접 실행 형태는 얇은 가드레일의 문서화된 제한으로 취급한다.
- 특정 우회 사례가 발견됐다는 이유만으로 일반 셸 파서, 세션 추적기 또는 전면적인 실행 차단기로 확장하지 않는다.
- 얇은 가드레일이 모든 실행 형태를 탐지하지 못한다는 점을 로컬 Codex 실행 허가로 해석해서는 안 된다.

# 사람이 직접 실행한 로컬 Codex와의 경계

- 사용자가 자신의 로컬 터미널에서 직접 시작한 Codex CLI 세션은 웹 ChatGPT의 Remote 작업이 아니며 위 제한의 대상이 아니다.
- 웹 ChatGPT는 사용자가 직접 실행한 Codex 세션을 종료하거나 방해하거나 해당 프로세스에 입력을 보내지 않는다.
- 웹 ChatGPT는 사용자의 Codex 설치, 인증, 자격 증명, 설정 또는 구독 상태를 변경하지 않는다.
- 웹 ChatGPT는 자신이 수행하는 Remote 작업을 사용자가 직접 실행한 Codex 작업으로 재분류해서는 안 된다.
- 웹 ChatGPT 작업과 사용자의 직접 Codex 작업이 동시에 진행되는 경우 브랜치, worktree, 수정 파일 및 실행 프로세스의 충돌 가능성을 먼저 확인한다.
- 사용자가 직접 시작한 Codex 세션의 소유권이나 제어권을 웹 ChatGPT가 임의로 가져오지 않는다.

# Git 및 Pull Request 규칙

- 기능, 수정 및 리팩터링 작업은 기본 브랜치에 직접 커밋하지 않고 별도 기능 브랜치에서 수행한다.
- 기본 브랜치는 원격 저장소의 HEAD와 실제 브랜치 설정을 확인하여 결정한다.
- 작업 전 현재 브랜치, HEAD SHA, 작업 트리 상태와 원격 저장소를 확인한다.
- 기존 변경사항이 있으면 출처와 충돌 여부를 확인하기 전까지 초기화하지 않는다.
- Pull Request를 검토할 때는 마지막 커밋만이 아니라 지정된 base와 head 사이의 전체 변경 범위를 확인한다.
- Pull Request가 Draft 상태이고 병합 승인을 받은 경우에는 Ready for review 상태로 전환한 뒤 병합한다.
- 병합은 squash merge 방식을 사용한다.
- 병합 후 가능한 경우 원격 기능 브랜치를 삭제한다.
- 사용자의 명시적 승인 없이 Pull Request를 병합하지 않는다.
- 정확한 head SHA 검증, 독립 리뷰 또는 별도의 병합 조건이 요구된 경우 해당 조건이 충족되기 전에는 병합하지 않는다.

# 로컬 작업과 프로세스 안전

- 명령을 실행하기 전에 현재 작업 디렉터리와 대상 저장소를 명확히 확인한다.
- 저장소별 node_modules, 빌드 결과물, worktree 및 실행 중인 런타임은 서로 독립된 상태로 취급한다.
- 다른 worktree에서 수행한 빌드나 패키지 설치가 현재 실행 경로에도 자동으로 적용된다고 가정하지 않는다.
- 실행 중인 Local MCP, 터널, 개발 서버 또는 사용자 프로세스를 종료해야 하는 경우에는 영향 범위를 먼저 설명하고 사용자 승인을 확인한다.
- 현재 연결을 제공하는 Local MCP의 런타임 파일을 교체하거나 프로세스를 종료하면 Remote 연결이 끊길 수 있음을 고려한다.
- npm ci, npm install, build 또는 clean 명령이 dist, 생성 파일 또는 node_modules를 재생성하거나 삭제할 수 있는지 먼저 확인한다.
- 실행 중인 런타임을 교체할 때는 기존 버전 전체를 복원할 수 있는 백업이나 정확한 Git SHA 기반 재구축 경로를 먼저 마련한다.
- 소스 버전과 실제 실행 중인 dist 버전이 다를 수 있으므로 각각을 구분하여 보고한다.
- 파일이 디스크에서 교체됐더라도 이미 실행 중인 프로세스는 재시작 전까지 이전 코드를 메모리에 유지할 수 있음을 고려한다.

# 검증과 완료 보고

- 작업 완료, 수정 완료, 배포 완료 또는 테스트 통과를 주장하기 전에 관련 검증 명령을 실제로 실행한다.
- 과거 실행 결과나 다른 브랜치, 다른 worktree 또는 다른 SHA의 결과를 현재 상태의 증거로 사용하지 않는다.
- 실행하지 못한 검증은 통과했다고 표현하지 않는다.
- 테스트 일부가 건너뛰어진 경우 전체 통과와 구분하여 보고한다.
- 빌드 성공, 단위 테스트, 통합 테스트, 패키지 검사 및 실제 런타임 검증을 서로 다른 증거로 구분한다.
- 변경 작업 결과에는 다음 내용을 구분하여 보고한다.
  - 작업한 저장소와 브랜치
  - 시작 SHA와 최종 SHA
  - 주요 변경 파일과 변경 목적
  - 실행한 빌드와 테스트
  - 테스트 통과, 실패 또는 건너뛰기 결과
  - 실행하지 못한 검증
  - 알려진 제한사항과 남은 위험
  - 작업 트리의 최종 상태
- 파일을 수정하지 않은 조사 작업에서는 변경이 없었다는 사실을 명시한다.
- 실제 실행 버전을 확인할 때는 Git HEAD만 보지 않고 실행 프로세스의 명령, 시작 시각 및 배치된 런타임 파일도 함께 확인한다.`;

const GUIDE_TEXT = `ChatGPT 프로젝트 전역 지침은 선택 사항이지만, 웹 ChatGPT가 Remote 또는 Local MCP를 통해 로컬 작업할 때 1차 가드레일로 사용하는 것을 권장합니다.

다음 중 하나를 선택해 주세요.

1. 빈 템플릿 보기
   - 프로젝트 이름, GitHub 저장소, 기본 로컬 작업공간이 placeholder로 남은 복사 가능한 템플릿을 제공합니다.

2. 프로젝트 정보를 입력해 완성본 만들기
   - 프로젝트 이름 예: VibeTutor
   - GitHub 저장소는 소유자/저장소 형식입니다. 예: lazyant91/VibeTutor
   - 기본 로컬 작업공간은 절대 경로입니다. 예: D:\\AI\\VibeTutor
   - 세 값을 모두 받은 뒤 최종 확인을 거쳐 완성본을 생성합니다.

웹 ChatGPT는 사용자의 선택을 먼저 확인하고, 2번을 선택한 경우 필요한 값을 차례로 질문한 뒤 최종 확인이 완료된 경우에만 generate 모드를 confirmed=true로 호출해야 합니다.`;

function writingBlock(body: string): string {
  return `${WRITING_START}\n${body}\n${WRITING_END}`;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function renderTemplate(values?: {
  projectName: string;
  githubRepository: string;
  workspaceRoot: string;
}): string {
  if (!values) return CHATGPT_PROJECT_INSTRUCTIONS_TEMPLATE;
  return CHATGPT_PROJECT_INSTRUCTIONS_TEMPLATE
    .split(PROJECT_NAME)
    .join(values.projectName)
    .split(GITHUB_REPOSITORY)
    .join(values.githubRepository)
    .split(WORKSPACE_ROOT)
    .join(values.workspaceRoot);
}

function errorResult(text: string): ServerResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

export async function getChatGPTProjectInstructions(args: unknown): Promise<ServerResult> {
  const parsed = GetChatGPTProjectInstructionsArgsSchema.safeParse(args);
  if (!parsed.success) {
    return errorResult(
      `Invalid arguments for get_chatgpt_project_instructions: ${parsed.error}`,
    );
  }

  if (parsed.data.mode === 'guide') {
    return { content: [{ type: 'text', text: GUIDE_TEXT }] };
  }

  if (parsed.data.mode === 'template') {
    return {
      content: [{ type: 'text', text: writingBlock(renderTemplate()) }],
    };
  }

  const projectName = clean(parsed.data.project_name);
  const githubRepository = clean(parsed.data.github_repository);
  const workspaceRoot = clean(parsed.data.workspace_root);
  const missing: string[] = [];
  if (!projectName) missing.push('프로젝트 이름 (예: VibeTutor)');
  if (!githubRepository) {
    missing.push('GitHub 저장소 (소유자/저장소 형식, 예: lazyant91/VibeTutor)');
  }
  if (!workspaceRoot) {
    missing.push('기본 로컬 작업공간 (절대 경로, 예: D:\\AI\\VibeTutor)');
  }

  if (missing.length > 0) {
    return errorResult(
      `완성된 프로젝트 전역 지침을 만들려면 다음 정보가 추가로 필요합니다.\n\n- ${missing.join('\n- ')}\n\n웹 ChatGPT는 누락된 값을 사용자에게 안내한 뒤 다시 호출해야 합니다.`,
    );
  }

  if (parsed.data.confirmed !== true) {
    return errorResult(
      `최종 확인이 필요합니다. 다음 정보로 프로젝트 전역 지침을 생성할지 사용자에게 확인한 뒤, 동의한 경우 confirmed=true로 다시 호출하세요.\n\n- 프로젝트 이름: ${projectName}\n- GitHub 저장소: ${githubRepository}\n- 기본 로컬 작업공간: ${workspaceRoot}`,
    );
  }

  return {
    content: [
      {
        type: 'text',
        text: writingBlock(
          renderTemplate({
            projectName: projectName!,
            githubRepository: githubRepository!,
            workspaceRoot: workspaceRoot!,
          }),
        ),
      },
    ],
  };
}
