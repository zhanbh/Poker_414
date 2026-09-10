# 414 内测网页版实施计划

**Goal:** 从零构建一个面向 4 位受邀玩家的 414 私房实时网页游戏，完整实现已确认的牌型、主牌、升级、立棍/反立和爆牌预警规则。

**Architecture:** 使用单仓库分层结构：`client/` 承载电脑端 React 页面，`server/` 承载 Node.js/Express/Socket.IO 实时房间服务，`shared/` 承载客户端和服务端共同使用的牌局模型与规则引擎。服务端只维护单房间的内存状态，不接数据库；固定全局邀请码通过服务端配置注入。

**Tech Stack:** TypeScript、React、Vite、Node.js、Express、Socket.IO、Vitest、React Testing Library。

**Source artifacts:** `requirements-eng-review.md`、`test-plan.md`、本次对话的最终规则决议。

**Source context:** 本计划完全基于本次对话中已确认的 Grill Q1–Q107 需求；当前工作区未发现 `requirements.md`、`prd.md`、UI 原型或现有源码，也不存在已有 `tasks.md`。

## 范围与非目标

- 范围：固定邀请码登录、单房间 4 人入座、AC/BD 固定组队、实时出牌、完整规则校验、重连、暂离标识、房主控制、连续升级轮次。
- 部署假设：单 Node.js 进程、单房间、内存状态、互联网 HTTP 内测地址。
- 非目标：公开匹配、多房间、账号体系、数据库持久化、机器人、聊天/语音、观战、录像回放、排行榜、战绩分享、倒计时自动过牌。
- 安全提示：HTTP 下全局邀请码会明文传输；计划只覆盖内测实现，不把该方案视为正式生产安全方案。

## Implementation Tasks

- [x] **Task 1: 建立轻量单仓库工程骨架**

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `server/src/index.ts`
- Create: `shared/src/index.ts`

**Approach:**
- 建立可由一个 npm 工作流构建、类型检查、测试和启动的单仓库结构；保持客户端、服务端、共享包边界清晰，避免引入数据库、ORM、状态管理框架或不必要的 UI 组件库。
- 配置 React/Vite 客户端、Node 服务端和共享 TypeScript 编译范围；开发环境允许 Vite 代理实时连接，生产构建提供服务端可托管的静态资源路径。
- 为保证本任务的 verification 可运行，客户端入口在本任务内使用可编译的最小占位视图；Task 5 后续替换该占位视图，不要求本任务引用尚未创建的 `client/src/App.tsx`。
- 只建立最小入口和脚本，不在本任务实现牌局行为。
- **Output contract:** 建立可安装、可类型检查、可测试和可构建的单仓库脚本与目录边界；后续任务在此基础上增量实现业务文件，并沿用统一的 TypeScript/Vitest/lint/build 命令。

**Test scenarios:**
- Test expectation: none — 本任务只有工程配置和空入口，不产生用户可见业务行为。

**Verification:**
- `npm install`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

骨架阶段尚无业务测试，不执行空测试集；Task 2起执行真实测试，禁止全局配置忽略无测试错误。

- [x] **Task 2: 实现共享牌模型与 414 规则引擎**

**Files:**
- Create: `docs/rule-reference.md`
- Create: `shared/src/cards.ts`
- Create: `shared/src/hand-types.ts`
- Create: `shared/src/rules.ts`
- Create: `shared/src/rule-engine.ts`
- Modify: `shared/src/index.ts`
- Create: `shared/test/rule-engine.test.ts`

**Approach:**
- **Upstream constraint:** Task 1 已提供单仓库目录、TypeScript 配置、测试/类型检查/构建脚本和可编译入口；本任务必须在该工程骨架上实现共享模型，不重新创建或替换基础工具链。
- 先将对话最终规则写入 `docs/rule-reference.md`，作为后续规则测试和界面文案基准。顺子至少3张、连对至少3对，仅3-A且不环绕；王可补缺口。每例显式给出有效主、实体牌和王替代点数。
- 普通同类型同长度比较：同牌面时少王优先（贴管例外），否则按相邻点数；再按既定特殊牌规则处理跨类型。牌力比较不是可传递的全序，不用于手牌排序。主5时555王为主4炸，主3时才为普通4炸。
- 报爆仅检查整手，按牌型模板与至多两张王的缺口匹配，不枚举所有子集；手牌或有效主变化才重算，点击/心跳不触发重算。
- 建立不可变的实体牌表示，区分 52 张普通牌与大小王，并保留王是否作为配牌、配成何种牌面的判定信息；花色只用于实体区分，不进入牌力比较。
- 将牌型识别、有效主、普通跟牌、差牌、炸牌、414、爆牌可行性和牌力比较集中在共享规则层，客户端只用于提示，服务端最终裁决。
- 每手的有效主由首牌权所属队伍传入并锁定；主牌进入顺子或连对时按普通牌处理。单牌/对子按贴着管，2 和主对子可跳管；顺子/连对限制长度和整体下一位。
- 覆盖大小王规则：不能单出；普通牌型可以配 A；414 中王只能替代 4；王可以配对子、顺子、连对、普通炸、主炸和 414；同牌面同级时真牌大于配牌。
- 以明确的牌型强度阶梯表达炸牌：普通 3、主 2、414、普通 4、主 3、普通 5、主 4、普通 6、主 5、主 6；3 张普通炸和 2 张主炸不能管连对，4 张普通炸、3 张主炸及以上和 414 可以管连对。非主5时 `555王` 识别为4张普通炸，主5时识别为主4炸。
- 差牌按出牌上下文识别为“同点数对子回应单牌”，不能主动首出；对子本身仍可作为爆牌候选。爆牌候选只判断全部剩余手牌能否组成一手可首出的合法牌型，不泄露具体牌面。
- **Output contract:** 输出共享的牌、牌型、主牌、比较结果、合法出牌结果和爆牌候选数据模型；服务端任务必须以这些模型作为唯一裁决输入，客户端任务必须以这些模型渲染牌型和操作提示。

**Test scenarios:**
- Happy path: 有效主为 3 时，普通单牌按 `4-A < 2 < 3` 比较；有效主为 5 时，`4→5` 可贴着出，主 5 为单牌最高。
- Happy path: 单牌 5 只能由 6 普通跟牌；2 或主可以跳管；顺子 `345` 只能由同长度的 `456` 管。
- Happy path: 连对 `334455` 只能由 `445566` 管；3 张普通炸和 2 张主炸拒绝管连对，4 张普通炸、3 张主炸和 414 允许管连对。
- Happy path: `44A`、`4A4`、`A44`均识别为同等级 414；`4王A`、`王王A`为配牌 414；`44王`只识别为 3 张 4 炸。
- Happy path: 有效主3时，`55王`识别为 3 张普通炸，`555王`识别为 4 张普通炸；王可配成当前主牌炸。
- Happy path: 同牌面同级时 `666` 大于 `66王`；但普通 3 张炸不能管普通 4 张炸。
- Happy path: 单张 5 由 `55` 或 `5王`回应时识别为差；差牌不可再被压过，并标记为立即结束当前轮的特殊结果。
- Happy path: 剩余 `444`、`3456`、`334455`、`44A` 等完整手牌可分别识别为爆牌候选；差牌资格由实际回应场景决定，不影响对子作为爆牌候选。
- Edge case: 有效主进入顺子或连对时，包含主牌点数的组合仍按普通顺子/连对识别，不升级为主炸。
- Edge case: 一手牌含两张王时，王只能各自补一个位置；非法把王替代 414 中 A 的组合必须拒绝。

**Verification:**
- `npm test -- --run shared/test/rule-engine.test.ts`
- `npm run typecheck`
- `npm run lint`

- [x] **Task 3: 实现权威牌局状态机与结算状态**

**Files:**
- Create: `shared/src/game-state.ts`
- Create: `shared/src/scoring.ts`
- Create: `shared/test/game-state.test.ts`
- Create: `shared/test/scoring.test.ts`

**Approach:**
- **Upstream constraint:** Task 1 已提供可运行的 TypeScript/Vitest 工程骨架；Task 2 已提供牌、牌型、有效主、合法出牌、比较结果和爆牌候选模型。本任务必须复用这些模型，不在状态机中复制牌力判断。
- 建立单房间状态模型：房间大厅、4 人入座、首局随机首牌、发牌后立棍/反立窗口、进行中的回合、有效玩家排名确定（尾家自动末位）后的结算、下一手过渡和房间结束。
- 固定座位 A/B/C/D 与 AC/BD 队伍；首局随机首牌，后续由上一手第一个出完牌的人取得首牌权，座位环顺序保持不变。立棍者或反立者获得本手首牌权。
- 每队分别保存 3-A 的升级等级和完成轮数；每手只使用首牌权所属队伍的等级作为有效主，并在本手内锁定。到 A 后只重置完成本轮的队伍为 3，另一队等级保留。
- 普通局同队拿到第1、2名时立即按抓两家结算，胜队升2，另一队两人无需继续；记录其未跑完，不虚构第3/4名次序。否则前三名跑完后，尾家自动记第四名，即使剩王等死牌也无需实际出完。首名队伍拿到第3名抓一家、第4名平局。下一局首牌归本局第一名。
- 每次出完先检查是否已经终局，再决定牌权。以最后两张牌打差出完后，由仍持牌的队友取得本局下一轮首牌，称为“接风”（拉风）。普通牌出完也适用：对方合法跟牌则继续当前轮；无人接管清桌后由队友首出。差牌不可被管，直接接风。不改变下一局首牌归属。若队友也已跑完，则结算，不再请求接风。立棍/反立只计有效玩家；单挑者跑完或胜负及末位已确定时结算，不把牌权交给弃牌队友。
- 实现 J 坎：胜利方按抓一家/抓两家或立棍/反立固定级数推进；平局保持 J；明确输掉且当前为 J 的队伍回到 3；到达 A 即完成该队一轮并重置。
- 立棍只有一轮，无人选择则使用原首牌候选（首局随机，后续上一局第一名）；立棍/反立改变首牌后再锁主。每队最多一人，其队友弃牌；无超时自动选择。
- 立棍者先跑则成功，另一队任一有效玩家先跑则失败。未反立时，立棍成功本方升4，对方无立棍扣级；立棍失败对方升4、本方降4。发生反立时，反立者成功本方升8，对方无反立扣级；反立失败对方升8、反立方降8；同一局只结算最终模式一次，不叠加立棍4级。降级最低3，不循环、不形成欠级。J坎是优先的独立规则：明确失败队当前为J则直接回3，不叠加其他扣级。
- 本局进行中禁止重新开始，至少等本局结算。
- 报爆：整手可一次出完时提示，公开标识但不泄露牌面。报爆后立即禁止拆牌，首出和跟牌都必须使用全部剩余手牌；整手能管时可出，不能管则过；取得首牌权必须整手出完。未报爆可拆牌并稍后报爆。对子可报爆，实际是否为差由回应场景判定。
- 记录无倒计时的活动时间；连续 30 秒无操作只产生暂离标识，不自动过牌、不暂停、不判负。重连保留原座位和牌局状态。
- 将洗牌、首局首牌随机和发牌的随机源作为可替换依赖；测试使用固定随机序列，明确 54 张牌一次性洗牌后按座位发成 13/14 张，不能重复发牌。
- **Output contract:** 提供可序列化的房间快照、牌局阶段、座位/队伍、等级与轮数、有效主、出牌权、公开牌面、玩家手牌私密视图、立棍/爆牌/暂离状态和结算结果；实时服务端只能通过状态转换更新这些值，客户端只能消费快照和事件。

**Test scenarios:**
- Happy path: 4 人入座后首局随机首牌候选只产生一次，立棍协商结束确定最终首牌后锁主；下一手由上一手第一个出完牌者首出，座位顺序仍为 A→B→C→D。
- Happy path: AC 先出完，BD 后出完，AC 名次为第 1、3 名时 AC 升 1；名次为第 1、2 名时升 2；名次为第 1、4 名时双方等级不变。
- Happy path: 当前主为 J 的队伍抓一家升到 Q、抓两家到 K；平局保持 J；明确输掉后回到 3；到 A 后只重置该队为 3并增加完成轮数。
- Happy path: 立棍者第一个出完时升 4；反立后单挑者第一个出完时升 8；队友在立棍状态下不能出牌。
- Happy path: 玩家剩余 `444`、`3456`、`334455` 或 `44A` 时可以报爆；报爆后下一次获得首牌权必须整手出完，未报爆时仍可拆出子集。
- Happy path: 345报爆后拆4跟单张3拒绝且不扣牌；整手345跟456合法并直接出完；不能整手管则可过。5王报爆后拆5拒绝。
- Edge case: 差牌作为同点数对子回应单牌时立即结束当前回合；同样牌面作为爆牌候选时只记录对子结构，不把爆牌误判为主动差牌。
- Edge case: 连续 30 秒无操作只把对应玩家标记为暂离；玩家恢复操作后标识消失，牌权、手牌和结算不被自动改变。
- Edge case: 房主在进行中的本手请求重新开始时被拒绝；本手结算完成后重新开始才清空双方等级、轮数和首牌状态。

**Verification:**
- `npm test -- --run shared/test/game-state.test.ts shared/test/scoring.test.ts`
- `npm run typecheck`
- `npm run lint`

- [x] **Task 4: 实现固定邀请码单房间实时服务端**

**Files:**
- Modify: `server/src/index.ts`
- Create: `server/src/config.ts`
- Create: `server/src/http.ts`
- Create: `server/src/room-service.ts`
- Create: `server/src/session-service.ts`
- Create: `shared/src/protocol.ts`
- Create: `server/test/room-service.test.ts`
- Create: `server/test/protocol.test.ts`
- Create: `server/test/http.test.ts`

**Approach:**
- **Upstream constraint:** Task 2 必须先提供稳定的牌、牌型、比较器和爆牌候选模型；Task 3 必须先提供权威状态转换和可序列化快照。本任务不得在 Socket 处理器中复制牌力或结算规则。
- 通过固定服务端配置校验全局邀请码；邀请码仅作为内测登录凭据，不建立用户账号。登录成功后生成临时会话，玩家提交昵称并进入唯一房间。
- 只允许一个房间实例，创建者成为房主；其他登录玩家使用房间号加入。第 5 名、重复昵称、已开始后的新加入和第二个并行房间都返回明确错误。
- 采用 Socket.IO 实时传输；所有出牌、过牌、立棍、反立、报爆、开始、重启和结束请求均由服务端检查当前玩家、阶段、牌权、手牌和共享规则结果，再广播最小必要公共快照，并向本人发送私密手牌视图。
- 提供刷新/断线重连：会话绑定原座位，房间未结束则恢复原玩家的私密手牌和状态；不使用机器人，不因断线自动过牌。服务端维护最后活动时间，向客户端暴露暂离状态。
- 房主只能在大厅开始、在非进行中的本手重开、或结束房间；进行中的本手禁止重开。房间完成 A 轮后继续运行。
- 提供只读 `GET /health` 健康检查，返回进程可用状态和当前单房间占用状态；不暴露邀请码、手牌或其他私密牌局数据。
- `shared/src/protocol.ts` 只描述事件名、请求/错误类别和客户端可见数据边界，不携带服务端私密手牌；单房间 HTTP 服务负责承载客户端构建产物，并保留普通 HTTP 内测配置。
- 会话协议：随机私密令牌绑定公开玩家ID与座位；浏览器保存令牌用于刷新恢复，服务端不信任客户端指定身份。第二页面接管同会话时旧连接失去操作权。
- 命令契约：携带局标识、状态版本、请求ID；当前会话验证后先查有界去重记录，重试返回原结果，再检查当前版本和阶段；校验到状态提交同步执行。成功只变更一次，旧局/旧版本请求拒绝并返回最新本人视图。房间结束清空缓存。
- 快照契约：公开状态和本人私密手牌分开投影；每次重连发送完整本人视图，客户端只接受当前局的更新版本；禁止广播内部完整状态、邀请码或令牌。
- 大厅增加房主移除玩家命令，进行中禁止移除；断线保留座位和房主权限。彻底丢失房主会话时，通过重启服务恢复大厅（丢失当前局），不自动转让房主。
- 用户活动使用独立节流事件，点击选牌也更新最后活动时间；Socket心跳只表示在线。用单个扫描器维护暂离，断线解绑监听，房间结束清理会话/缓存/计时器；无需持久化。
- **Output contract:** 上述会话、请求ID/局标识/版本、全量私密投影、移除与活动事件是Task5/6必需的接口约束。提供登录、建房/入房、重连、开始、出牌、过牌、立棍/反立、报爆、重开、结束和状态订阅的共享协议；客户端必须只通过这些协议发起操作，任何服务端拒绝都返回稳定错误类别并保持原状态不变。

**Test scenarios:**
- Happy path: 正确固定邀请码登录、填写唯一昵称、创建房间、三人用房间号加入，房主开始后 4 个客户端收到相同公共快照和各自私密手牌。
- Error path: 错误邀请码、重复昵称、第 5 名加入、第二房间创建、开局后加入、非房主开始、非房主重开和进行中重开均返回对应错误且状态不变。
- Happy path: 当前玩家提交合法出牌后只有牌权按规则转移；非法牌型、不是当前玩家、过牌阶段错误均被服务端拒绝；相同请求ID重试返回原结果且不重复改变状态。
- Happy path: 立棍/反立、爆牌选择和下一次首牌权强制整手出完通过协议广播；其他玩家只看到预警和公开牌面，不看到私密手牌。
- Happy path: 客户端断线后使用原会话重连，恢复原座位、剩余手牌、有效主、当前牌权和爆牌承诺；断线期间不自动过牌。
- Edge case: 连续 30 秒无操作后公共快照出现暂离标识，恢复任何有效操作后标识消失，不生成倒计时或自动动作。
- Error path: 客户端伪造其他玩家的手牌、牌型、等级、首牌权或结算结果时，服务端忽略伪造字段并依据内存状态重新判定。
- Happy path: `GET /health` 在服务可用时返回成功状态和单房间占用信息，响应不包含邀请码、玩家手牌或其他私密字段。

**Verification:**
- `npm test -- --run server/test/room-service.test.ts server/test/protocol.test.ts server/test/http.test.ts`
- `npm run typecheck`
- `npm run lint`

- [x] **Task 5: 实现电脑端登录、大厅与对局界面**

**Files:**
- Modify: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/styles.css`
- Create: `client/src/transport/socket-client.ts`
- Create: `client/src/views/AccessView.tsx`
- Create: `client/src/views/LobbyView.tsx`
- Create: `client/src/views/GameView.tsx`
- Create: `client/src/components/PlayerSeat.tsx`
- Create: `client/src/components/CardHand.tsx`
- Create: `client/src/components/ActionBar.tsx`
- Create: `client/src/components/MainStatus.tsx`
- Create: `client/src/components/StandDialog.tsx`
- Create: `client/src/components/BurstPrompt.tsx`
- Create: `client/src/components/PresenceBadge.tsx`
- Create: `client/test/access-flow.test.tsx`
- Create: `client/test/lobby-view.test.tsx`
- Create: `client/test/game-view.test.tsx`

**Approach:**
- **Upstream constraint:** Task 4 已定义登录、入房、重连、房主控制、出牌、过牌、立棍/反立、报爆和快照协议；本任务必须使用共享协议，不在浏览器端自行决定有效主、牌型强度、结算或升级。
- **Upstream constraint:** Task4会话令牌、请求ID/局标识/状态版本、全量本人投影、活动与移除协议必须在传输层实现。刷新用令牌恢复；旧页面被接管后停止操作并提示；拒绝旧操作后同步快照，不自行重放到新局。
- 大厅提供房主移除玩家；选择手牌等用户操作发送节流活动事件，网络心跳不能清除暂离。房主断线不转让权限。
- 登录页只提供固定邀请码和昵称；成功后进入唯一房间。大厅显示 4 个座位、AC/BD 队伍、房主标识、房间号、入座/断线状态，并仅允许房主在 4 人到齐后开始。
- 对局页以电脑端为主：中心展示上一手公开牌和当前牌权，四周展示玩家昵称、队伍、剩余牌数、名次、暂离标识和爆牌标识；玩家自己的手牌可点击选中，其他玩家手牌始终隐藏。
- 首局随机首牌权完成后播放明确的随机动画，动画结束展示首牌权人和本手有效主；后续手次直接展示上一手首牌权继承结果。
- 操作区提供出牌、过牌、报爆和立棍/反立入口；当同一组选牌存在差/炸等多种解释时显示明确选择框；服务端错误以可理解的提示呈现，不能通过前端灰显代替服务端校验。
- 不显示回合倒计时；连续 30 秒无操作时显示暂离标识，操作恢复后移除。刷新或重连时恢复到服务端快照，不重置本地选择以外的牌局状态。
- 用固定座位布局和横向手牌区服务电脑浏览器；保留最小宽度和溢出处理，避免为手机端引入单独的交互模型。
- **Output contract:** 产出完整用户路径：邀请码登录 → 输入昵称 → 加入唯一房间 → 房主开始 → 观察有效主/牌权/牌型 → 出牌/过牌/报爆/立棍 → 查看结算与下一手；测试任务必须通过共享协议模拟该路径。

**Test scenarios:**
- Happy path: 输入正确邀请码和未重复昵称后进入大厅；错误邀请码或重复昵称显示错误并停留当前页面。
- Happy path: 四名玩家入座后大厅显示 AC/BD、房主和开始按钮；不足四人时房主不能开始，开局后不显示加入入口。
- Happy path: 游戏页显示本手有效主、当前牌权、上一手公开牌、双方等级、每人剩余牌数和已出完名次，不显示其他玩家手牌。
- Happy path: 选择 `55` 回应单张 5 时可选择差；选择 `333` 时可选择炸；报爆后显示本人操作状态和其他玩家的公共预警标识，但不泄露剩余牌面。
- Happy path: 选中不合法牌型时出牌按钮不可提交并显示原因；服务端拒绝时保留原手牌和牌权。
- Happy path: 玩家连续 30 秒无操作显示暂离，再次点击选牌、出牌或过牌后标识消失；页面没有倒计时和自动过牌。
- Happy path: 刷新或模拟重连后恢复原座位、手牌、有效主、牌权和爆牌承诺；玩家退出房间后不会被错误显示为新玩家。
- Edge case: 立棍或反立窗口只在首张牌前出现，确认后显示队友弃牌和新的首牌权；进行中的本手不展示重新开始按钮。

**Verification:**
- `npm test -- --run client/test/access-flow.test.tsx client/test/lobby-view.test.tsx client/test/game-view.test.tsx`
- `npm run typecheck`
- `npm run lint`

- [x] **Task 6: 建立规则与用户路径的集成验收套件**

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/four-player.spec.ts`
- Create: `e2e-scenarios.md`
- Create: `tests/acceptance/room-and-game.test.ts`
- Create: `tests/acceptance/rule-cases.test.ts`
- Create: `tests/acceptance/reconnect-and-presence.test.ts`
- Modify: `package.json`

**Approach:**
- **Upstream constraint:** Task 2 提供唯一规则引擎，Task 3 提供牌局状态转换，Task 4 提供单房间协议，Task 5 提供用户路径界面；本任务只能通过公开协议和状态转换验证整条链路，不能复制规则实现。
- 使用 Vitest、内存 fake socket 和组件测试替身覆盖登录、入房、开始、发牌、立棍、普通出牌、过牌、差、炸、414、爆牌、结算、升级、J 坎、A 轮重置、重连和暂离标识。
- 将已确认的示例编写成回归场景，尤其覆盖有效主由首牌权队伍决定、主进入顺子/连对后变普通牌、连对炸牌最低级别、414 配牌和 `555王` 的 4 张炸判定。
- 单元/模拟集成测试不依赖外部进程。另设Playwright E2E阶段，由测试配置启动真实构建服务，四个隔离浏览器身份验证从登录到结算、静态资源和Socket连接、刷新/接管、私密手牌不可见。互联网地址验收步骤写入 `e2e-scenarios.md`，与本地E2E区分。
- **Upstream constraint:** Task4的令牌、版本和请求ID协议须覆盖ACK丢失重试只扣牌一次、旧局动作拒绝、第二标签接管使旧连接失权。活动心跳不得解除暂离，房主移除必须鉴权；重复重连和房间关闭不得积累监听/会话/缓存。
- 规则回归补充：主8时34王(配5)被345管、345不被567管；主5时555王为主4炸。报爆算法只接收完整手牌，不随UI活动重复计算。
- **Output contract:** 提供可重复运行的单命令验收集，并把每个规则示例映射到明确输入、动作顺序和预期快照/结算结果；后续改动必须先通过该套件。

**Test scenarios:**
- Happy path: 四名玩家用固定邀请码进入唯一房间，房主开始，首局随机首牌确定有效主，完成一手并按第 1/2/3/4 名结算。
- Happy path: 分别验证 `ABCD`、`ABDC`、`BACD` 顺序的升级、平局、下一手首牌权和有效主归属。
- Happy path: 验证 `345→456`、`334455→445566`、2/主跳管单牌和对子、差牌立即结束、414 强度及完整炸牌阶梯。
- Happy path: 验证王不能单出、普通牌型可配 A、414 中王不能配 A、真牌管同牌面配牌、主牌在顺子/连对中按普通牌。
- Happy path: 验证剩余 `444` 报爆后下一次首牌必须整手出完，未报爆可拆牌；报爆等待期间也只能整手跟牌，否则过。
- Happy path: 验证普通升级、J 坎、立棍升 4、反立升 8、到 A 后单队重置和多轮继续。
- Error path: 验证错误邀请码、第 5 名、重复昵称、第二房间、非房主开始/重开、进行中重开、非当前玩家出牌和伪造牌型均失败且状态不变。
- Edge case: 验证 30 秒无操作只显示暂离，不自动过牌、不暂停、不改变结算；断线重连后继续原座位和私密手牌。

**Verification:**
- `npm test -- --run tests/acceptance/room-and-game.test.ts tests/acceptance/rule-cases.test.ts tests/acceptance/reconnect-and-presence.test.ts`
- `npm run test:e2e` — 先构建再启动真实服务，四浏览器验收全部通过，失败返回非零。
- `npm run typecheck`
- `npm run lint`
- `npm run build`

- [x] **Task 7: 完成单进程 HTTP 打包与内测部署文档**

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `README.md`
- Create: `docs/deployment.md`
- Modify: `docs/rule-reference.md`
- Modify: `server/src/http.ts`

**Approach:**
- **Upstream constraint:** Task 4 必须提供单进程 HTTP 服务和静态资源承载能力；Task 6 必须先通过规则与用户路径验收。本任务只补齐生产构建、启动入口、配置说明和内测操作文档，不引入 Docker、数据库或外部基础设施依赖。
- 配置固定邀请码、监听地址和端口等环境变量；客户端构建产物由同一 Node 进程提供，Socket.IO 与静态页面使用同一 HTTP 地址，保持单房间内存模型。
- `README.md` 说明本地启动、四人内测流程、房主操作和已知限制；`docs/deployment.md` 说明在一台可被互联网访问的 Node.js 主机上安装依赖、设置固定邀请码、启动服务和查看健康状态的步骤；`docs/rule-reference.md` 固化已确认的规则矩阵和验收案例。
- 明确 HTTP 仅用于受控内测；文档警告全局邀请码会明文传输，并保留未来切换 HTTPS 的部署边界。
- **Output contract:** 输出一个可构建、可启动、可由 4 位玩家通过同一 HTTP 地址访问的发布包，以及不依赖特定云厂商的内测部署说明。

**Test scenarios:**
- Happy path: 设置有效固定邀请码后构建并启动单进程服务，客户端静态资源和实时连接使用同一地址。
- Error path: 缺少邀请码配置时服务启动失败并给出明确配置错误；错误配置不能回退到公开访问。
- Happy path: 四名玩家按 `README.md` 流程完成登录、入房、开始和一手牌；第五名玩家被拒绝。
- Edge case: 服务重启后内存房间丢失，文档明确说明该行为，不伪装成持久化恢复。

**Verification:**
- `npm run typecheck`
- `npm run lint`
- `npm test -- --run`
- `npm run build`
- `if (-not (Test-Path -LiteralPath 'README.md')) { exit 1 }`
- `if (-not (Test-Path -LiteralPath 'docs/deployment.md')) { exit 1 }`
- `if (-not (Test-Path -LiteralPath 'docs/rule-reference.md')) { exit 1 }`

## 运维前置事项

<!-- not for Subagent-Driven Development -->

- 需要一台可被 4 位内测玩家访问的 Node.js 主机，并开放 HTTP 端口。
- 需要由内测负责人设置一个固定全局邀请码；邀请码不应发布到公开渠道。
- 若未来不再是封闭内测，应在部署层切换 HTTPS、轮换邀请码并评估正式身份系统。

## 工程审查决议（2026-09-10）

E1–E5的用户玩法决议已同步：报爆禁止拆牌；尾家自动末位；同队前两名立即抓两家结算；未终局才执行接风；J升两级到K；立棍/反立成功仅己方升级，失败才按模式扣4/8级，最低3，J坎优先。E6–E10已由用户全部接受并纳入Task1/2/4/5/6/7，包含会话重连契约、前置规则基准、房间管理、真实浏览器E2E与资源清理。详见requirements-eng-review.md和test-plan.md。
