/**
 * Vietnamese product copy from Design Contract inventory
 * (`docs/design/2026-08-17-aura-mobile-mvp.spec.md`).
 * Auth keys remain in `features/auth/copy.ts` for M2 compatibility.
 */

export const tabsCopy = {
  home: "Trang chủ",
  history: "Lịch sử",
  settings: "Cài đặt",
} as const;

export const homeCopy = {
  greeting: "Xin chào",
  title: "Chọn người đồng hành",
  error_load: "Không tải được danh sách nhân vật.",
  error_start_session: "Không tạo được phiên. Thử lại nhé.",
  retry: "Thử lại",
  persona: {
    tough_interviewer: {
      name: "Người phỏng vấn khắt khe",
      blurb: "Luyện phỏng vấn áp lực, câu hỏi xoáy, phản hồi thẳng.",
    },
    native_buddy: {
      name: "Bạn bản xứ",
      blurb: "Trò chuyện tự nhiên, sửa lỗi ngay trong câu chuyện.",
    },
  },
} as const;

export const sessionCopy = {
  back_a11y: "Quay lại",
  menu_a11y: "Thêm tùy chọn",
  ptt_label: "Giữ để nói",
  ptt_a11y: "Giữ để nói, thả để gửi",
  chip: {
    idle: "Sẵn sàng",
    listen: "Đang nghe",
    talk: "Đang nói",
    recording: "Đang ghi",
    processing: "Đang xử lý",
  },
  error_turn: "Chưa nghe rõ lượt này. Thử nói lại nhé.",
  error_connect: "Mất kết nối phiên.",
  mic_permission_title: "Cần quyền micro",
  mic_permission_body: "Aura cần micro để bạn luyện nói.",
  mic_permission_cta: "Mở cài đặt",
} as const;

export const historyCopy = {
  title: "Lịch sử hội thoại",
  empty_title: "Chưa có cuộc hội thoại",
  empty_body: "Chọn một người đồng hành để bắt đầu luyện nói.",
  empty_cta: "Về trang chủ",
  row_meta: "{date} · {turns} lượt",
  error_load: "Không tải được lịch sử.",
} as const;

export const settingsCopy = {
  title: "Cài đặt",
  section_account: "Tài khoản",
  section_privacy: "Quyền riêng tư",
  email: "Email",
  wipe_row: "Xóa toàn bộ lịch sử",
  wipe_title: "Xóa lịch sử?",
  wipe_body:
    "Hành động này không hoàn tác. Toàn bộ hội thoại và bộ nhớ sẽ bị xóa vĩnh viễn.",
  wipe_cancel: "Hủy",
  wipe_confirm: "Xóa vĩnh viễn",
  wipe_success: "Đã xóa lịch sử",
  logout: "Đăng xuất",
} as const;

export const safetyCopy = {
  title: "Aura đang ở chế độ an toàn",
  body: "Nếu bạn đang khó khăn, hãy liên hệ hỗ trợ gần bạn. Aura vẫn lắng nghe — không phán xét.",
  resource_child: "Tổng đài 111 (trẻ em)",
  resource_emergency: "Cấp cứu 115",
  dismiss: "Đã hiểu",
} as const;

export const networkCopy = {
  title: "Cần kết nối mạng",
  body: "Aura cần mạng để luyện nói và đồng bộ phiên.",
  retry: "Thử lại",
} as const;

export const commonCopy = {
  retry: "Thử lại",
  cancel: "Hủy",
  loading: "Đang tải…",
} as const;
