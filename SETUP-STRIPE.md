# 💳 Setup Stripe — Phần việc của bạn (Phase 1: Web)

> Code đã xong. File này là các bước cấu hình **bạn** phải làm (mình không tạo tài khoản/khóa thay được).
> Làm bằng **Stripe Test mode** trước (thẻ test `4242 4242 4242 4242`, ngày bất kỳ tương lai, CVC bất kỳ) — KHÔNG tốn tiền thật. Khi chạy ổn mới chuyển Live.

Mô hình giá đã chốt: **$11.99/tháng** và **$119/năm** (giảm ~17%), **không free trial**.

---

## 1. Chạy migration trong Supabase
- Mở Supabase → SQL Editor → dán toàn bộ `db/migration.sql` → Run.
- Việc này tạo bảng `subscriptions` (mục 4b). An toàn chạy lại (dùng `if not exists`).

## 2. Tạo Product + Price trên Stripe
- Stripe Dashboard (Test mode) → **Products** → Add product → tên "MicroPoker Master Pro".
- Thêm **2 recurring prices**:
  - Monthly: $11.99 / month → copy **Price ID** (`price_...`)
  - Annual: $119 / year → copy **Price ID**
- Giữ 2 Price ID này cho bước 4.

## 3. Lấy API keys
- Stripe → Developers → **API keys** → copy **Secret key** (`sk_test_...`).

## 4. Đặt env vars trên Vercel
Vercel → Project → Settings → Environment Variables, thêm:

| Key | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_PRICE_MONTHLY` | Price ID gói tháng |
| `STRIPE_PRICE_ANNUAL` | Price ID gói năm |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `STRIPE_WEBHOOK_SECRET` | lấy ở bước 5 |

> `SUPABASE_URL` / `SUPABASE_ANON_KEY` đã có sẵn (coach.js dùng chung). Service-role key là **bí mật tuyệt đối** — đừng để lộ ra client.

## 5. Tạo Webhook endpoint
- Stripe → Developers → **Webhooks** → Add endpoint.
- URL: `https://<domain-vercel-cua-ban>/api/stripe-webhook`
- Chọn events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Sau khi tạo → copy **Signing secret** (`whsec_...`) → đặt vào `STRIPE_WEBHOOK_SECRET` (bước 4) → redeploy.

## 6. Test thử (test mode)
1. Mở app (đã deploy), đăng nhập, phân tích đủ 5 hand → hiện Leak Profile teaser.
2. Bấm **Unlock full Leak Profile** → bấm Upgrade → nhập thẻ `4242 4242 4242 4242`.
3. Thanh toán xong → Stripe redirect về `/coach?checkout=success` → app tự refresh → Leak Profile mở full (thấy $ thật).
4. Kiểm tra bảng `subscriptions` trong Supabase có 1 dòng `status = active`.

### Test webhook ở local (tùy chọn)
```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe-webhook
# copy whsec_... mà lệnh in ra → đặt STRIPE_WEBHOOK_SECRET khi chạy `vercel dev`
```

## 7. Lên Live
- Lặp lại bước 2–5 ở **Live mode** (product/price/keys/webhook live đều khác test).
- Đổi env vars trên Vercel sang khóa Live → redeploy.

---

## ✅ Sau khi xong
- Pro là thật, đồng bộ đa thiết bị (đọc từ Supabase), không fake được từ browser.
- Hủy gói: Stripe gửi `customer.subscription.deleted` → webhook cập nhật → hết hạn thì `isPro` tự thành false.

## ⏭️ Phase 2 (sau, khi bọc mobile)
- Thay `startCheckout` bằng RevenueCat, `usePro` đọc entitlement của store.
- Giữ nguyên shape `{ isPro }` nên phần còn lại không phải sửa.
