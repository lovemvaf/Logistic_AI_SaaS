/**
 * Bộ tên màn hình dùng chung cho toàn bộ `navigation/`.
 *
 * Tất cả `.tsx` màn hình đều được tham chiếu qua đây để `RootNavigator` và
 * `TabNavigator` không dùng string thô, tránh lỗi gõ khi điều hướng.
 */

export const SCREEN_NAMES = {
  LOGIN: 'Login',
  /** Màn hình chính: tổng quan ca của tài xế. */
  HOME: 'Home',
  /** Danh sách chuyến. */
  TRIPS: 'Trips',
  /** Hồ sơ tài xế. */
  PROFILE: 'Profile',
  /** Chi tiết chuyến đang chạy. */
  TRIP_DETAIL: 'TripDetail',
  /** Nộp chứng từ giao hàng. */
  POD: 'POD',
  /** Báo chi phí. */
  EXPENSE: 'Expense',
  /** Nộp COD. */
  REMITTANCE: 'Remittance',
  /** Điểm an toàn và cảnh báo hành vi. */
  SAFETY: 'SafetyScore',
  /** Phân tích dữ liệu telematics ngoại tuyến. */
  TELEMATICS: 'OfflineTelematicsAnalysis',
} as const;

export type ScreenName = (typeof SCREEN_NAMES)[keyof typeof SCREEN_NAMES];
