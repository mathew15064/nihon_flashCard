# Nghiệm thu nội dung N5 — T01 (100 từ)

**Phạm vi:** fixture và công cụ kiểm thử offline, từ base
`e26127da426838a211e3add5638b65b8cc2b907a`. Worker T01 **không**
gọi endpoint, ghi MySQL, publish, merge, deploy hay đụng mã v1.

## Bộ dữ liệu và schema đã đối chiếu

- `app/fixtures/jlpt-n5-100.json` là một **envelope offline**, không phải
  payload MCP trực tiếp. Cấu trúc: `{topicName,lessons:[{lessonName,items}]}`.
- Topic: **Tiếng Nhật N5 – 100 từ nền tảng**.
- Mỗi từ chứa **chính xác** `word`, `reading`, `romanization`,
  `meaningVi`, `jlptLevel`, tất cả là chuỗi không rỗng;
  `jlptLevel` được gán **N5 dự kiến**.
- Các trường từ vựng tuân theo
  `app/src/modules/vocabulary/schema.ts` và
  `app/src/modules/vocabulary/batch-schema.ts`. Không thêm `status`,
  `visibility`, `publish`, `partOfSpeech` hay metadata chưa được duyệt.
  MCP `lesson_add_vocabulary_batch` chỉ nhận `{lessonId,items}` **hoặc**
  `{topicName,lessonName,items}`.
- `reading` là kana chuẩn của mục từ (katakana cho từ vay mượn);
  `romanization` dùng Hepburn ASCII chữ thường: kéo dài âm theo kana
  bằng `ou`/`uu`, riêng dấu kéo dài `ー` lặp nguyên âm
  (ví dụ `がっこう → gakkou`, `ぎゅうにゅう → gyuunyuu`,
  `ノート → nooto`). Không dùng macron. Nghĩa Việt được chọn ngắn,
  dùng `;` để tách các nghĩa phổ biến khi cần.

| Bài học (lessonName) | Số từ |
| --- | ---: |
| Bài 01 – Con người và gia đình | 20 |
| Bài 02 – Trường học và đồ dùng | 20 |
| Bài 03 – Thời gian và số đếm | 20 |
| Bài 04 – Ăn uống và mua sắm | 20 |
| Bài 05 – Địa điểm, đi lại và hoạt động | 20 |
| **Tổng** | **100** |

## Kiểm tra offline

Từ thư mục gốc repository, dùng Node.js >= 22:

```bash
node app/scripts/validate-n5-100.mjs
node app/scripts/validate-n5-100.mjs --self-test
```

Validator chỉ đọc file, **không kết nối MCP/website/database**. Nó kiểm tra:
100 từ, 5 bài × 20; đầy đủ và đúng năm trường, giới hạn độ dài,
Unicode NFC, không khoảng trắng thừa/ký tự điều khiển hoặc zero-width,
`word` thuộc hệ chữ Nhật, `reading` là kana, `romanization` là Hepburn
ASCII khớp kana, `meaningVi` có chữ Latin phù hợp, mọi `jlptLevel=N5`.
Khóa trùng theo **đúng cách normalize trong ứng dụng**:
`[word,reading,partOfSpeech||""]` → NFKC → chữ thường → trim → nối `|`.
Vì fixture không có `partOfSpeech`, phần khóa thứ ba rỗng; cả 100 khóa
phải khác nhau. Chế độ `--self-test` tạo 8 biến thể lỗi **trong bộ nhớ**
(thiếu số lượng, thiếu nghĩa, ký tự sai ở word/reading, trùng normalizedKey,
romaji lệch, cấp JLPT khác N5, trường cấm `status`) và kiểm tra đều bị
từ chối. Validator không xác nhận giáo trình hay chuyên môn tiếng Nhật.

## Quy trình MCP Batch để nghiệm thu sau này — CHƯA THỰC HIỆN

**Chỉ được nạp khi quản trị viên cho phép.** Môi trường test dự kiến:
`https://broke.locallhost.shop`, endpoint `/mcp` qua Streamable HTTP.
Không gửi credential Admin trong prompt, không suy đoán NoAuth đang bật,
không kết nối production và không tự nhập nội dung từ T01.

1. Nhận duyệt nội dung, xác minh endpoint/scope token **test** và
   chạy validator PASS. Liệt kê công cụ bằng `tools/list`;
   đối chiếu input schema đang được máy chủ quảng cáo. Nếu lệch
   với mã tại base thì **dừng nhập**.
2. Dùng MCP `topics_create` với `{ "name": "<topicName>" }` để tạo/tái sử
   dụng topic; `lessons_create` 5 lần với
   `{ "name": "<lessonName>", "topicId": "<topic-id>" }`,
   ghi lại ID từ phản hồi. Lesson phải còn **private**.
3. Trích năm request riêng biệt offline bằng lệnh **chỉ đọc** sau.
   Mỗi dòng chứa `{topicName,lessonName,items}`, với đúng 20 từ.
   Dùng nguyên dòng làm input cho `lesson_add_vocabulary_batch`, hoặc
   dùng `{lessonId,items}` nếu đã có ID thật. **Không gửi toàn bộ envelope
   trong một request; không trộn hai kiểu chọn lesson.**

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
const { topicName, lessons } = JSON.parse(readFileSync("app/fixtures/jlpt-n5-100.json", "utf8"));
for (const { lessonName, items } of lessons) {
  console.log(JSON.stringify({ topicName, lessonName, items }));
}
'
```

4. **Sau phê duyệt**, dùng `lesson_add_vocabulary_batch` lần lượt cho
   5 bài (mỗi batch 20). Ghi từng `lessonId`, `received`, `created`,
   `duplicates`, `linked`, `alreadyLinked` và `errors:[{index,code}]`;
   yêu cầu `received=20`, `errors=[]`, kiểm tra
   `created+duplicates=20` và `linked+alreadyLinked=20` nếu không có lỗi.
   `created` có thể nhỏ hơn 20 do từ đã tồn tại và được dedup.
   Mọi `index` lỗi theo thứ tự item ban đầu: **dừng và báo lỗi**,
   không tự retry khi chưa xác định nguyên nhân.
5. MCP chỉ tạo **draft** trong lesson **private**. Không có công cụ
   MCP publish; việc công bố thuộc quyền Admin.

## Kiểm tra qua Admin — CHƯA THỰC HIỆN

Sau khi nạp thử được cấp phép, đăng nhập **Admin test** tại
`/admin/lessons`, lọc topic và mở từng lesson. Đếm đúng 20 liên kết/bài,
100 liên kết tổng, đối chiếu `word`, `reading`, `romanization`,
`meaningVi`, `jlptLevel` với file và phản hồi MCP. Kiểm tra tất cả
entry đang **draft**, tất cả lesson **private**; không lấy `created` làm
số lượng liên kết vì server có tái sử dụng vocabulary. Kiểm tra phía
public không lộ private/draft.

**Sau khi người biết tiếng Nhật xác nhận nội dung và có lệnh riêng:**
Admin mới cân nhắc `publish-selected` hoặc `publish-all` cho entry,
sau đó publish lesson bằng thao tác tách biệt. Không làm ở T01.
Xem [hợp đồng Topic/Lesson/Batch](TOPIC_LESSON_BATCH.md).

## Chờ người biết tiếng Nhật duyệt (không coi đã verified)

**JLPT:** Toàn bộ **100 nhãn N5** là đề xuất biên tập, **chưa đối chiếu
với từ điển/giáo trình chuẩn và chưa được giáo viên phê duyệt**.
JLPT không có một danh sách từ vựng chính thức đầy đủ để bảo đảm
xếp hạng từng từ. Ưu tiên kiểm tra các mục dễ khác nhau giữa tài liệu:
`鞄 (かばん)`, `黒板 (こくばん)`, `郵便局 (ゆうびんきょく)`,
`走る (はしる)`, `乗る (のる)`, `降りる (おりる)`.
Nếu bất kỳ mục nào chưa đạt: để draft, đề xuất thay thế có duyệt,
rồi chạy lại validator; **không tự tuyên bố danh sách N5 chính thức**.

| Mục cần duyệt | Nội dung cần quyết định |
| --- | --- |
| `四/よん`, `七/なな`, `九/きゅう` | Biến thể `し`, `しち`, `く`, cách đọc trong số ghép. |
| `今日/きょう`, `明日/あした`, `昨日/きのう` | Biến thể theo ngữ cảnh và lựa chọn đọc cho người mới. |
| `父`, `母`, `兄`, `姉`, `弟`, `妹` | “Của mình” và cách xưng hô gia đình người khác. |
| `学生`, `先生`, `友達` | Phạm vi nghĩa và cách dùng trong tình huống thực tế. |
| `時間`, `半` | Thời lượng với cách nói giờ rưỡi, nửa đơn vị. |
| `ご飯`, `お茶`, `高い`, `聞く` | Đa nghĩa, giới hạn nghĩa Việt ngắn. |
| `ノート`, `ペン`, `パン` | Chính tả katakana; romaji của âm dài trong `ノート`. |
| `鞄`, `黒板`, `郵便局`, `走る`, `乗る`, `降りる` | Độ phù hợp JLPT N5 và tần suất sư phạm. |

**Điều kiện nghiệm thu cuối:** validator PASS, 100 normalizedKey không
trùng, người biết tiếng Nhật ký duyệt đọc/nghĩa/phân loại JLPT. PASS
offline **không đồng nghĩa** đã nhập MCP, đã duyệt học liệu hoặc đã
publish trên website.
