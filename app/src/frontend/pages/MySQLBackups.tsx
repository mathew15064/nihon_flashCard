import { useCallback, useEffect, useState } from "react";
import { api, write } from "../api";

type Backup={id:string;createdAt:string;bytes:number};
type BackupResult={verified:true;tables:number;rows:number;bytes:number;sha256:string};
export default function MySQLBackups(){
  const [backups,setBackups]=useState<Backup[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [staging,setStaging]=useState("nihon_restore_qa");
  const refresh=useCallback(async()=>{
    const data=await api<{items:Backup[]}>("/api/v1/admin/backups/mysql");
    setBackups(data.items);
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError(
    e instanceof Error?e.message:"Không thể tải danh sách backup."));},[refresh]);
  async function backup(){
    if(!window.confirm(
      "Tạo backup mã hóa trên volume server? File có thể chứa toàn bộ dữ liệu người học. Cần tải xuống và lưu riêng cùng khóa khôi phục."
    ))return;
    setBusy(true);setMessage("");setError("");
    try{
      const data=await write<BackupResult&{id:string}>("/api/v1/admin/backups/mysql",{});
      await refresh();
      setMessage("Đã tạo và kiểm tra backup "+data.id+
        " · "+data.tables+" bảng · "+data.rows+" dòng. Hãy tải về kho lưu trữ riêng.");
    }catch(e){setError(e instanceof Error?e.message:"Tạo backup thất bại.");}
    finally{setBusy(false);}
  }
  async function stage(id:string){
    if(!/^nihon_restore_[a-z0-9_]{3,40}$/.test(staging)){
      setError("Database staging phải bắt đầu bằng nihon_restore_ và chỉ gồm chữ thường, số, dấu gạch dưới.");
      return;
    }
    if(!window.confirm(
      "Xác nhận chỉ khôi phục vào database MySQL staging HOÀN TOÀN TRỐNG '"+staging+
      "'? Không chuyển ứng dụng sang database staging. Dữ liệu staging cần được bảo vệ như dữ liệu thật."
    ))return;
    setBusy(true);setMessage("");setError("");
    try{
      const data=await write<{
        restored:true;database:string;tables:number;rows:number;verified:true;
      }>("/api/v1/admin/backups/mysql/"+id+"/stage",{
        database:staging,confirmation:"RESTORE_TO_EMPTY_STAGING",
      });
      if(!data.restored||!data.verified)throw new Error("MYSQL_STAGE_NOT_VERIFIED");
      setMessage("Khôi phục staging thành công tại "+data.database+" · "+
        data.tables+" bảng · "+data.rows+
        " dòng đối soát. Database ứng dụng đang chạy không thay đổi.");
    }catch(e){setError(e instanceof Error?e.message:"Khôi phục staging thất bại.");}
    finally{setBusy(false);}
  }
  async function remove(id:string){
    if(!window.confirm("Xóa vĩnh viễn file backup trên server? Hãy chắc chắn bạn đã lưu bản sao an toàn ở nơi khác. Không tự xóa backup ngoài máy chủ."))return;
    setBusy(true);setMessage("");setError("");
    try{
      await write("/api/v1/admin/backups/mysql/"+id+"/delete",{
        confirmation:"DELETE_LOCAL_BACKUP",
      });
      await refresh();setMessage("Đã xóa bản sao trên server: "+id);
    }catch(e){setError(e instanceof Error?e.message:"Không xóa được backup.");}
    finally{setBusy(false);}
  }
  async function verify(id:string){
    setBusy(true);setMessage("");setError("");
    try{
      const data=await write<BackupResult>(
        "/api/v1/admin/backups/mysql/"+id+"/verify",{});
      setMessage("Xác minh thành công: "+id+" · "+data.rows+
        " dòng · "+data.tables+" bảng. Chưa thực hiện restore.");
    }catch(e){setError(e instanceof Error?e.message:"Backup không hợp lệ.");}
    finally{setBusy(false);}
  }
  return <section className="admin-panel">
    <h2>Sao lưu MySQL</h2>
    <p className="muted">
      Tạo snapshot nhất quán, nén và mã hóa trên server. Sau đó tải file
      để lưu ở vị trí an toàn khác. Chỉ kiểm tra backup, <strong>không tự khôi phục
      hoặc ghi đè database</strong>.
    </p>
    <p className="muted">
      Quan trọng: giữ riêng <code>instance-secret.key</code> và SQLite bootstrap
      trong volume ứng dụng. Không có khóa này, file backup mã hóa không thể khôi phục.
      Giới hạn phiên bản này: tối đa 100.000 dòng và 128 MiB dữ liệu thô mỗi lần sao lưu.
    </p>
    <button type="button" className="button primary" disabled={busy}
      onClick={()=>void backup()}>{busy?"Đang xử lý…":"Tạo backup MySQL"}</button>
    {message?<p className="notice" role="status">{message}</p>:null}
    {error?<p className="form-error" role="alert">{error}</p>:null}
    <label>Database MySQL staging đã tạo sẵn và còn trống
      <input className="input-text" value={staging} maxLength={64}
        onChange={e=>setStaging(e.target.value)} placeholder="nihon_restore_qa"/>
    </label>
    <p className="muted">Chỉ chấp nhận schema riêng có tiền tố
      <code> nihon_restore_</code>, tồn tại sẵn và hoàn toàn trống.
      Mọi dữ liệu khôi phục chỉ nằm trong staging. Không tự xóa schema staging sau kiểm thử.
      Định dạng nhỏ: tối đa 25.000 dòng và 32 MiB để giới hạn tài nguyên.</p>
    {backups.length?<div className="form-vertical">
      <h3>Backup đã tạo</h3>
      {backups.map(item=><div className="review-row" key={item.id}>
        <div className="review-description">
          <strong>{item.id}</strong>
          <p className="muted">{new Date(item.createdAt).toLocaleString("vi-VN")} ·
            {(item.bytes/1024).toFixed(1)} KiB (mã hóa)</p>
        </div>
        <div className="candidate-actions">
          <button type="button" className="button outline" disabled={busy}
            onClick={()=>void verify(item.id)}>Kiểm tra toàn vẹn</button>
          <button type="button" className="button outline" disabled={busy}
            onClick={()=>void stage(item.id)}>Khôi phục staging</button>
          <a className="button outline"
            href={"/api/v1/admin/backups/mysql/"+item.id+"/download"}
            download={item.id}>Tải về</a>
          <button type="button" className="button outline" disabled={busy}
            onClick={()=>void remove(item.id)}>Xóa bản local</button>
        </div>
      </div>)}
    </div>:<p className="muted">Chưa có bản sao lưu trên server.</p>}
  </section>;
}
