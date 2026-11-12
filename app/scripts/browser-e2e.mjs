import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as pause } from "node:timers/promises";
import mysql from "mysql2/promise";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const source=process.env.NIHON_MYSQL_TEST_URL;
if(!source){
  console.error("NIHON_MYSQL_TEST_URL must target a disposable MySQL 8.4 QA instance");
  process.exit(2);
}
const parsed=new URL(source);
if(parsed.protocol!=="mysql:"||!parsed.pathname.startsWith("/nihon_qa"))
  throw new Error("E2E_REFUSES_NON_QA_MYSQL_TARGET");
const database="nihon_e2e_"+randomBytes(7).toString("hex");
const root={
  host:parsed.hostname,port:Number(parsed.port||3306),
  user:decodeURIComponent(parsed.username),password:decodeURIComponent(parsed.password),
  charset:"utf8mb4",
};
const rootPool=await mysql.createConnection(root);
const tmp=mkdtempSync(join(tmpdir(),"nihon-browser-e2e-"));
let child,browser;
let capture="";
const failures=[];
async function availablePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  const address=server.address();
  const port=address&&typeof address!=="string"?address.port:0;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
const port=await availablePort();
const origin="http://127.0.0.1:"+port;
async function healthy(){
  for(let retry=0;retry<120;retry++){
    if(child?.exitCode!==null)throw new Error("E2E_SERVER_DIED");
    try{
      const response=await fetch(origin+"/api/v1/setup/status",{signal:AbortSignal.timeout(900)});
      if(response.ok)return;
    }catch{/* Server may still be starting. */}
    await pause(250);
  }
  throw new Error("E2E_SERVER_NOT_READY");
}
async function waitForCode(){
  for(let i=0;i<120;i++){
    const match=/One-time setup code \(server console only\): ([A-Za-z0-9_-]{24,})/.exec(capture);
    if(match)return match[1];
    await pause(150);
  }
  throw new Error("E2E_SETUP_CODE_MISSING");
}
async function assertNoOverflow(page,stage){
  const metrics=await page.evaluate(()=>({
    scroll:document.documentElement.scrollWidth,
    viewport:document.documentElement.clientWidth,
  }));
  assert.ok(metrics.scroll<=metrics.viewport+2,
    stage+": horizontal overflow "+JSON.stringify(metrics));
}
async function checkNoPageErrors(page,stage){
  assert.deepEqual(failures,[],stage+" browser JS errors");
}
async function auditAccessibility(page,stage){
  const results=await new AxeBuilder({page}).withTags([
    "wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa",
  ]).analyze();
  const errors=results.violations.map(violation=>({
    id:violation.id,impact:violation.impact,
    nodes:violation.nodes.slice(0,6).map(node=>({
      target:node.target,summary:node.failureSummary?.slice(0,240),
    })),
  }));
  if(errors.length)console.error("A11Y_VIOLATIONS",stage,JSON.stringify(errors));
  assert.equal(errors.length,0,stage+" WCAG accessibility violations");
  console.log("BROWSER_A11Y_PASS",stage);
}
try{
  await rootPool.query("CREATE DATABASE `"+database+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
  child=spawn(process.execPath,["dist/server/index.mjs"],{
    cwd:process.cwd(),env:{
      ...process.env,NODE_ENV:"production",NIHON_DATA_DIR:tmp,
      HOST:"127.0.0.1",PORT:String(port),
      AUTH_SECRET:undefined,DB_PATH:undefined,
    },stdio:["ignore","pipe","pipe"],
  });
  child.stdout.on("data",chunk=>{capture+=String(chunk).slice(0,20000);capture=capture.slice(-60000);});
  child.stderr.on("data",chunk=>{capture+=String(chunk).slice(0,20000);capture=capture.slice(-60000);});
  await healthy();
  const code=await waitForCode();
  browser=await chromium.launch({
    headless:true,
    ...(process.env.NIHON_CHROMIUM_PATH?{executablePath:process.env.NIHON_CHROMIUM_PATH}:{}),
    args:["--disable-dev-shm-usage","--no-sandbox"],
  });
  const context=await browser.newContext({
    baseURL:origin,viewport:{width:1366,height:880},
    locale:"vi-VN",reducedMotion:"reduce",
  });
  const page=await context.newPage();
  page.on("pageerror",e=>failures.push(e.message));
  const setup=()=>{
    return page.getByRole("heading",{name:"Khởi tạo hệ thống"});
  };
  await page.goto("/setup");
  await setup().waitFor({state:"visible"});
  assert.equal(await page.getByRole("radio").count(),0,"MySQL-only wizard");
  await assertNoOverflow(page,"desktop setup");
  await auditAccessibility(page,"setup");
  const labels={
    host:page.getByLabel("MySQL host"),
    port:page.getByLabel("Port",{exact:true}),
    db:page.getByLabel("Tên database"),
    user:page.getByLabel("Username"),
    password:page.getByLabel("Password",{exact:true}),
    tls:page.getByLabel("Kết nối TLS"),
    code:page.getByLabel("Mã khởi tạo một lần"),
    adminPassword:page.getByLabel("Mật khẩu Admin"),
    repeat:page.getByLabel("Xác nhận mật khẩu"),
  };
  await labels.host.fill(root.host);
  await labels.port.fill(String(root.port));
  await labels.db.fill(database);
  await labels.user.fill(root.user);
  await labels.password.fill(root.password);
  await labels.tls.selectOption("off");
  await labels.code.fill(code);
  await page.getByRole("button",{name:"Kiểm tra kết nối MySQL"}).click();
  await page.getByText("Kết nối MySQL đã xác minh:").waitFor({state:"visible"});
  await labels.adminPassword.fill("browser-e2e-admin-password-2026");
  await labels.repeat.fill("browser-e2e-admin-password-2026");
  await page.getByText("Cho phép người học tự đăng ký").click();
  await page.getByRole("button",{name:"Hoàn tất cài đặt"}).click();
  await page.getByRole("heading",{name:/Mỗi từ mới/}).waitFor();
  assert.equal((await (await fetch(origin+"/api/v1/setup/status")).json()).data.installed,true);
  console.log("BROWSER_SETUP_MYSQL_ONLY_PASS");

  await page.goto("/admin/login");
  await page.getByRole("heading",{name:"Đăng nhập quản trị"}).waitFor();
  await auditAccessibility(page,"admin-login");
  await page.getByLabel("Mật khẩu Admin").fill("browser-e2e-admin-password-2026");
  await page.getByRole("button",{name:"Đăng nhập Admin"}).click();
  await page.getByRole("heading",{name:"Quản trị nội dung"}).waitFor();
  await auditAccessibility(page,"admin");
  const word="海辺"+randomBytes(3).toString("hex");
  await page.getByLabel("Tiếng Nhật").fill(word);
  await page.getByLabel("Kana").fill("うみべ");
  await page.getByLabel("Nghĩa tiếng Việt").fill("bờ biển");
  await page.getByRole("button",{name:"Lưu bản nháp"}).click();
  const draft=page.locator(".review-row").filter({hasText:word});
  await draft.getByRole("button",{name:"Xuất bản",exact:true}).click();
  await page.getByText("Đã xuất bản từ "+word).waitFor();
  const deck="Nihon E2E Deck "+randomBytes(3).toString("hex");
  await page.getByLabel("Tên bộ từ").fill(deck);
  await page.getByLabel("Mô tả").fill("Học theo bộ từ bằng trình duyệt");
  await page.getByRole("button",{name:"Tạo bộ từ riêng tư"}).click();
  const card=page.locator(".admin-panel").filter({has:page.getByRole("heading",{name:deck})});
  await card.getByLabel("Thêm từ vào bộ").selectOption({label:word+" (published)"});
  await card.getByText("1 từ:").waitFor();
  await card.getByRole("button",{name:"Xuất bản bộ từ"}).click();
  await page.getByText("Đã xuất bản bộ "+deck).waitFor();
  console.log("BROWSER_ADMIN_VOCABULARY_DECK_PUBLISH_PASS");

  await page.getByRole("link",{name:"Settings",exact:true}).click();
  await page.getByRole("heading",{name:"Cài đặt hệ thống"}).waitFor();
  const integrations=page.getByRole("region",{name:"Trạng thái tích hợp"});
  await integrations.getByRole("button",{name:"Làm mới trạng thái"}).waitFor();
  assert.equal(await integrations.getByRole("button",{
    name:"Kiểm tra API key & model OpenAI",
  }).isDisabled(),true,"cannot verify OpenAI without saved credentials");
  await auditAccessibility(page,"admin-settings");
  await page.getByLabel(/OpenAI API key/).fill("sk-e2e-only-this-is-not-a-real-provider-key");
  await page.getByRole("button",{name:"Lưu cấu hình"}).click();
  await page.getByText("Đã lưu cấu hình trên server.").waitFor();
  await integrations.getByRole("button",{name:"Kiểm tra API key & model OpenAI"})
    .waitFor({state:"visible"});
  assert.equal(await integrations.getByRole("button",{
    name:"Kiểm tra API key & model OpenAI",
  }).isEnabled(),true,"saved provider key should enable safe metadata check");
  await page.getByRole("link",{name:"AI Studio"}).click();
  await page.getByRole("heading",{name:"AI Vocabulary Studio"}).waitFor();
  await auditAccessibility(page,"ai-studio");
  await page.getByText("Đã cấu hình key phía server").waitFor();
  await page.getByRole("link",{name:"Settings",exact:true}).click();
  await page.getByRole("heading",{name:"Cài đặt hệ thống"}).waitFor();
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Tạo / xoay token"}).first().click();
  await page.getByLabel("Token mới cấp").waitFor();
  const token=await page.getByLabel("Token mới cấp").inputValue();
  assert.ok(token.length>=24,"MCP read token must be generated");
  await page.reload();
  await page.getByRole("heading",{name:"Cài đặt hệ thống"}).waitFor();
  assert.equal(await page.getByLabel("Token mới cấp").count(),0,
    "MCP token must only be displayed on initial issue");
  const status=await page.locator(".review-row").filter({hasText:"MCP Read"}).innerText();
  assert.match(status,/Đã cấp token/);
  await integrations.getByText(/Read: Có token/).waitFor();
  await integrations.getByRole("button",{name:"Làm mới trạng thái"}).click();
  await integrations.getByText(/MySQL: Đã kết nối/).waitFor();
  console.log("BROWSER_ADMIN_SETTINGS_AI_MCP_TOKEN_PASS");

  await page.getByRole("button",{name:"Đăng xuất"}).click();
  await page.goto("/admin");
  await page.getByRole("heading",{name:"Đăng nhập quản trị"}).waitFor();
  console.log("BROWSER_PROTECTED_ADMIN_ROUTE_PASS");
  await page.goto("/vocabulary");
  await page.getByLabel("Tìm từ").fill(word);
  await page.getByText(word,{exact:true}).waitFor();
  await auditAccessibility(page,"vocabulary-search");
  await page.goto("/decks");
  await page.getByRole("link",{name:new RegExp(deck)}).waitFor();
  await auditAccessibility(page,"decks-public");
  await page.getByRole("link",{name:new RegExp(deck)}).click();
  await page.getByRole("heading",{name:deck}).waitFor();
  await auditAccessibility(page,"deck-details");
  await page.getByRole("link",{name:/Học bộ từ này/}).click();
  await page.getByRole("heading",{name:"Ôn tập từ vựng"}).waitFor();
  await auditAccessibility(page,"practice-guest");
  await page.getByRole("button",{name:"Học bộ này"}).click();
  await page.getByText(word,{exact:true}).first().waitFor();
  const flashcard=page.locator(".practice-card");
  await flashcard.focus();
  await page.keyboard.press("Space");
  await page.getByText("bờ biển",{exact:true}).waitFor();
  assert.equal(await flashcard.getAttribute("aria-pressed"),"true");
  await auditAccessibility(page,"flashcard-revealed");
  await page.getByRole("button",{name:/Đã nhớ/}).click();
  await page.getByText(/Bạn đã ôn xong các thẻ đến hạn/).waitFor();
  console.log("BROWSER_PUBLIC_DISCOVERY_GUEST_FLASHCARD_SRS_PASS");

  const username="e2e_"+randomBytes(5).toString("hex");
  const learnerPassword="browser-e2e-learner-password-2026";
  await page.goto("/account/register");
  await page.getByRole("heading",{name:"Tạo tài khoản"}).waitFor();
  await auditAccessibility(page,"register");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Tên hiển thị").fill("Người học E2E");
  await page.getByLabel("Mật khẩu",{exact:true}).fill(learnerPassword);
  await page.getByLabel("Xác nhận mật khẩu").fill(learnerPassword);
  await page.getByRole("button",{name:"Tạo tài khoản"}).click();
  await page.getByRole("heading",{name:"Đăng nhập",exact:true}).waitFor();
  await auditAccessibility(page,"learner-login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(learnerPassword);
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();
  await page.getByRole("heading",{name:"Ôn tập từ vựng"}).waitFor();
  const [claimResponse]=await Promise.all([
    page.waitForResponse(res=>res.url().includes("/api/v1/me/claim-guest")),
    page.getByRole("button",{name:"Chuyển tiến độ khách vào tài khoản"}).click(),
  ]);
  const claimPayload=await claimResponse.json();
  assert.equal(claimResponse.status(),200,JSON.stringify(claimPayload));
  assert.equal(claimPayload.data.cardsMoved,1,"guest review cards should transfer");
  await page.waitForFunction(()=>{
    const counter=document.querySelector(".study-stats strong");
    return counter?.textContent?.trim()==="1";
  },undefined,{timeout:12000});
  console.log("BROWSER_LEARNER_SIGNUP_LOGIN_CLAIM_PROGRESS_PASS");

  await page.goto("/account/security");
  await page.getByRole("heading",{name:"Bảo mật tài khoản"}).waitFor();
  await auditAccessibility(page,"account-security");
  await page.getByLabel("Mật khẩu hiện tại").fill(learnerPassword);
  await page.getByLabel("Mật khẩu mới",{exact:true}).fill("browser-e2e-learner-rotated-password-2026");
  await page.getByLabel("Xác nhận mật khẩu mới").fill("browser-e2e-learner-rotated-password-2026");
  await page.getByRole("button",{name:"Đổi mật khẩu"}).click();
  await page.getByText("Đã đổi mật khẩu. Các phiên đăng nhập cũ đã bị thu hồi.").waitFor();
  await page.getByRole("button",{name:"Đăng xuất"}).click();
  await page.goto("/account/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(learnerPassword);
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();
  await page.getByText("Tên đăng nhập hoặc mật khẩu không đúng.").waitFor();
  await page.getByLabel("Mật khẩu").fill("browser-e2e-learner-rotated-password-2026");
  await page.getByRole("button",{name:"Đăng nhập",exact:true}).click();
  await page.getByRole("heading",{name:"Ôn tập từ vựng"}).waitFor();
  console.log("BROWSER_LEARNER_PASSWORD_ROTATION_PASS");

  const mobile=await browser.newContext({
    baseURL:origin,viewport:{width:390,height:844},isMobile:true,
    deviceScaleFactor:1,locale:"vi-VN",hasTouch:true,
  });
  const mobilePage=await mobile.newPage();
  mobilePage.on("pageerror",e=>failures.push(e.message));
  for(const width of [320,390,768]){
    await mobilePage.setViewportSize({width,height:844});
    for(const url of ["/","/vocabulary","/decks","/practice","/account/login"]){
      await mobilePage.goto(url);
      await mobilePage.locator("main").waitFor();
      await mobilePage.waitForLoadState("networkidle",{timeout:12000});
      await assertNoOverflow(mobilePage,"mobile "+width+"px "+url);
      if(width===390)await auditAccessibility(mobilePage,"mobile "+url);
    }
  }
  console.log("BROWSER_MOBILE_LAYOUT_NO_OVERFLOW_PASS");

  // Skip navigation and maintain meaningful focus when routes change.
  const keyboard=await context.newPage();
  await keyboard.goto("/");
  await keyboard.getByRole("heading",{name:/Mỗi từ mới/}).waitFor();
  await keyboard.keyboard.press("Tab");
  assert.equal(await keyboard.evaluate(()=>document.activeElement?.textContent?.trim()),
    "Bỏ qua điều hướng","skip link must be the first Tab stop");
  await keyboard.keyboard.press("Enter");
  assert.equal(await keyboard.evaluate(()=>document.activeElement?.id),
    "main-content","skip link must reach the main landmark");
  await keyboard.getByRole("link",{name:"Từ vựng",exact:true}).click();
  await keyboard.getByRole("heading",{name:"Kho từ vựng"}).waitFor();
  assert.equal(await keyboard.evaluate(()=>document.activeElement?.id),
    "main-content","client-side navigation should move focus into content");
  assert.equal(await keyboard.title(),"Kho từ vựng · Nihon Vocabulary");
  await keyboard.close();
  console.log("BROWSER_KEYBOARD_NAVIGATION_AND_FOCUS_PASS");

  // On backend loss, never pretend the installation is usable or show login.
  const offline=await browser.newContext({baseURL:origin});
  const offlinePage=await offline.newPage();
  offlinePage.on("pageerror",e=>failures.push(e.message));
  await offlinePage.route("**/api/v1/setup/status",route=>route.abort());
  await offlinePage.goto("/");
  await offlinePage.getByRole("heading",{name:"Không thể kết nối Nihon"}).waitFor();
  await offlinePage.unroute("**/api/v1/setup/status");
  await offlinePage.getByRole("button",{name:"Thử kết nối lại"}).click();
  await offlinePage.getByRole("heading",{name:/Mỗi từ mới/}).waitFor();
  console.log("BROWSER_OFFLINE_ERROR_AND_RETRY_PASS");
  await offline.close();

  await checkNoPageErrors(page,"main journey");
  await checkNoPageErrors(mobilePage,"mobile journey");
  console.log("BROWSER_FULL_USER_JOURNEY_PASS");
}finally{
  try{await browser?.close();}catch{/* Continue cleanup after a browser crash. */}
  if(child&&child.exitCode===null){
    child.kill("SIGTERM");
    await Promise.race([
      new Promise(resolve=>child.once("exit",resolve)),
      pause(4000),
    ]);
    if(child.exitCode===null)child.kill("SIGKILL");
  }
  await rootPool.query("DROP DATABASE IF EXISTS `"+database+"`").catch(()=>{});
  await rootPool.end();
  rmSync(tmp,{recursive:true,force:true});
}
