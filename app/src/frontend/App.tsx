import { useCallback,useEffect,useState,createContext,useContext } from "react";
import { Link,NavLink,Route,Routes,Navigate } from "react-router-dom";
import {api,write} from "./api";
import Vocabulary from "./pages/Vocabulary";
import {Decks,DeckDetails} from "./pages/Decks";
import Practice from "./pages/Practice";
import {AccountLogin,AccountRegister,AdminLogin} from "./pages/Login";
import Admin from "./pages/Admin";
import AIStudio from "./pages/AIStudio";

export type Actor={id:string;name:string;role:"admin"|"learner"};
type Session={user:Actor|null;signUpEnabled:boolean;guest:boolean};
type ContextType={actor:Actor|null;signUpEnabled:boolean;refresh:()=>Promise<void>};
const Context=createContext<ContextType>({actor:null,signUpEnabled:false,refresh:async()=>{}});
export const useAuth=()=>useContext(Context);

function Home(){
  return <>
    <section className="hero">
      <div>
        <span className="eyebrow">日本語 · Học từ vựng mỗi ngày</span>
        <h1>Mỗi từ mới,<br/><em>một bước tiến.</em></h1>
        <p>Học từ vựng tiếng Nhật theo chủ đề, khám phá flashcard và ôn đúng thời điểm với Nihon SRS.</p>
        <div className="hero-actions">
          <Link className="button primary" to="/vocabulary">Khám phá từ vựng →</Link>
          <Link className="button outline" to="/practice">Bắt đầu luyện tập</Link>
        </div>
      </div>
      <div className="hero-card">
        <div className="card-top"><span>今日の言葉</span><span className="mini-dot"/></div>
        <div className="hero-japanese">食べる</div>
        <div className="hero-reading">たべる · taberu</div>
        <div className="hero-meaning">Ăn</div>
        <div className="hero-example">毎朝、パンを食べます。</div>
        <div className="card-bottom">Ví dụ minh họa</div>
      </div>
    </section>
    <div className="features">
      <article><span className="feature-icon">語</span><h3>Từ vựng</h3><p>Tra cứu tiếng Nhật theo chữ và Kana.</p></article>
      <article><span className="feature-icon">記</span><h3>Flashcard + SRS</h3><p>Ghi nhớ nhờ ôn tập cách quãng.</p></article>
      <article><span className="feature-icon">AI</span><h3>AI + MCP</h3><p>Admin biên soạn nội dung với AI và AI Agent.</p></article>
    </div>
  </>;
}

export default function App(){
  const [actor,setActor]=useState<Actor|null>(null);
  const [signUpEnabled,setSignUpEnabled]=useState(false);
  const [ready,setReady]=useState(false);
  const refresh=useCallback(async()=>{
    try{
      const data=await api<Session>("/api/v1/auth/me");
      setActor(data.user);setSignUpEnabled(data.signUpEnabled);
    }catch{setActor(null);}
    finally{setReady(true);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function logout(){
    try{await write("/api/v1/auth/logout",{});await refresh();}
    catch{setActor(null);}
  }
  return <Context.Provider value={{actor,signUpEnabled,refresh}}>
    <header className="site-header">
      <Link className="brand" to="/"><span className="brand-mark">日</span><span>Nihon <span className="brand-sub">Vocabulary</span></span></Link>
      <nav className="site-nav" aria-label="Điều hướng">
        <NavLink to="/vocabulary">Từ vựng</NavLink>
        <NavLink to="/decks">Bộ từ</NavLink>
        <NavLink to="/practice">Ôn tập</NavLink>
        {actor?.role==="admin"?<NavLink to="/admin">Admin</NavLink>:null}
      </nav>
      <div className="header-account">
        {actor?<><span className="muted">{actor.name}</span><button type="button" className="quiet-button" onClick={logout}>Đăng xuất</button></>:
          <Link className="button outline" to="/account/login">Đăng nhập</Link>}
      </div>
    </header>
    <main className="site-main">
      {!ready?<div className="notice">Đang kết nối hệ thống…</div>:
        <Routes>
          <Route path="/" element={<Home/>}/>
          <Route path="/vocabulary" element={<Vocabulary/>}/>
          <Route path="/decks" element={<Decks/>}/>
          <Route path="/decks/:id" element={<DeckDetails/>}/>
          <Route path="/practice" element={<Practice/>}/>
          <Route path="/account/login" element={<AccountLogin/>}/>
          <Route path="/account/register" element={<AccountRegister/>}/>
          <Route path="/admin/login" element={<AdminLogin/>}/>
          <Route path="/admin" element={actor?.role==="admin"?<Admin/>:<Navigate to="/admin/login" replace/>}/>
          <Route path="/admin/ai-studio" element={actor?.role==="admin"?<AIStudio/>:<Navigate to="/admin/login" replace/>}/>
          <Route path="*" element={<div className="content-page"><h1>Không tìm thấy trang</h1><Link to="/">Về trang chủ</Link></div>}/>
        </Routes>}
    </main>
    <footer className="site-footer">Nihon Vocabulary · Fastify + React + Vite · Monolith TypeScript</footer>
  </Context.Provider>;
}
