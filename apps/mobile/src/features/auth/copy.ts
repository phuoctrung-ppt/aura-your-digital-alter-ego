/**
 * Vietnamese auth copy keys from Design Contract inventory
 * (`docs/design/2026-08-17-aura-mobile-mvp.spec.md` — auth.*).
 * Extra client-only keys (mismatch / email taken / forgot stub) are marked.
 */
export const authCopy = {
  brand: "Aura",
  tagline: "Sẵn sàng luyện nói",
  email_label: "Email",
  password_label: "Mật khẩu",
  password_confirm_label: "Nhập lại mật khẩu",
  login_cta: "Đăng nhập",
  register_cta: "Tạo tài khoản",
  forgot_password: "Quên mật khẩu?",
  no_account: "Chưa có tài khoản?",
  have_account: "Đã có tài khoản?",
  go_register: "Đăng ký",
  go_login: "Đăng nhập",
  error_generic: "Không đăng nhập được. Thử lại nhé.",
  error_invalid: "Email hoặc mật khẩu chưa đúng.",
  /** Client validation — not in design inventory; needed for confirm match. */
  error_password_mismatch: "Mật khẩu nhập lại chưa khớp.",
  /** Sensible EMAIL_TAKEN mapping (inventory has no dedicated key). */
  error_email_taken: "Email này đã được dùng.",
  /** Forgot-password has no API in M2. */
  forgot_coming_soon: "Sắp có",
  /** Password show/hide a11y (icon-only → VN label). */
  show_password: "Hiện mật khẩu",
  hide_password: "Ẩn mật khẩu",
} as const;

export type AuthCopyKey = keyof typeof authCopy;
