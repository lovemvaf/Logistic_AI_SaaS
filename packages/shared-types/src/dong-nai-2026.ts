export type DongNaiUnitType = "WARD" | "COMMUNE";
export type LogisticsCorridorTag = "NORTH" | "CENTRAL" | "SOUTH";

export interface DongNaiUnitMaster {
  canonicalName: string;
  normalizedName: string;
  unitType: DongNaiUnitType;
  corridor: LogisticsCorridorTag;
  officialCodeStatus: "PENDING_OFFICIAL_CODE";
  boundaryStatus: "NO_OFFICIAL_POLYGON";
  sourceDoc: string;
}

export function normalizeVietnameseAdminName(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/^(phuong|xa|thi tran|tt\.|p\.|x\.|tp\.|thanh pho|huyen|thi xa|tx\.)\s+/i, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeVietnameseAliasKey(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const WARD_NAMES_WITH_CORRIDOR: Array<[string, LogisticsCorridorTag]> = [
  ["Biên Hòa", "CENTRAL"],
  ["Trấn Biên", "CENTRAL"],
  ["Trảng Dài", "CENTRAL"],
  ["Tam Hiệp", "CENTRAL"],
  ["Long Bình", "CENTRAL"],
  ["Hố Nai", "CENTRAL"],
  ["Long Hưng", "SOUTH"],
  ["Phước Tân", "SOUTH"],
  ["Tam Phước", "SOUTH"],
  ["Bình Lộc", "CENTRAL"],
  ["Long Khánh", "CENTRAL"],
  ["Bảo Vinh", "CENTRAL"],
  ["Xuân Lập", "CENTRAL"],
  ["Hàng Gòn", "CENTRAL"],
  ["Tân Triều", "CENTRAL"],
  ["Long Thành", "SOUTH"],
  ["Nhơn Trạch", "SOUTH"],
  ["Trảng Bom", "CENTRAL"],
  ["Dầu Giây", "CENTRAL"],
  ["Xuân Lộc", "CENTRAL"],
  ["Tân Phú", "NORTH"],
  ["Trị An", "CENTRAL"],
  ["Bình Phước", "NORTH"],
  ["Đồng Xoài", "NORTH"],
  ["Minh Hưng", "NORTH"],
  ["Chơn Thành", "NORTH"],
  ["Lộc Ninh", "NORTH"],
  ["An Lộc", "NORTH"],
  ["Bình Long", "NORTH"],
  ["Tân Khai", "NORTH"],
  ["Phước Bình", "NORTH"],
  ["Phước Long", "NORTH"],
  ["Đồng Phú", "NORTH"],
];

const COMMUNE_NAMES_WITH_CORRIDOR: Array<[string, LogisticsCorridorTag]> = [
  ["Đại Phước", "SOUTH"],
  ["Phước An", "SOUTH"],
  ["Phước Thái", "SOUTH"],
  ["Long Phước", "SOUTH"],
  ["Bình An", "SOUTH"],
  ["An Phước", "SOUTH"],
  ["An Viễn", "SOUTH"],
  ["Bình Minh", "CENTRAL"],
  ["Bàu Hàm", "CENTRAL"],
  ["Hưng Thịnh", "CENTRAL"],
  ["Gia Kiệm", "CENTRAL"],
  ["Thống Nhất", "CENTRAL"],
  ["Xuân Quế", "SOUTH"],
  ["Xuân Đường", "SOUTH"],
  ["Cẩm Mỹ", "SOUTH"],
  ["Sông Ray", "SOUTH"],
  ["Xuân Đông", "CENTRAL"],
  ["Xuân Định", "CENTRAL"],
  ["Xuân Phú", "CENTRAL"],
  ["Xuân Hòa", "CENTRAL"],
  ["Xuân Thành", "CENTRAL"],
  ["Xuân Bắc", "CENTRAL"],
  ["La Ngà", "CENTRAL"],
  ["Định Quán", "CENTRAL"],
  ["Phú Vinh", "CENTRAL"],
  ["Phú Hòa", "CENTRAL"],
  ["Tà Lài", "NORTH"],
  ["Nam Cát Tiên", "NORTH"],
  ["Phú Lâm", "NORTH"],
  ["Tân An", "CENTRAL"],
  ["Nha Bích", "NORTH"],
  ["Tân Quan", "NORTH"],
  ["Tân Hưng", "NORTH"],
  ["Minh Đức", "NORTH"],
  ["Lộc Thành", "NORTH"],
  ["Lộc Hưng", "NORTH"],
  ["Lộc Tấn", "NORTH"],
  ["Lộc Thạnh", "NORTH"],
  ["Lộc Quang", "NORTH"],
  ["Tân Tiến", "NORTH"],
  ["Thiện Hưng", "NORTH"],
  ["Hưng Phước", "NORTH"],
  ["Phú Nghĩa", "NORTH"],
  ["Đa Kia", "NORTH"],
  ["Bình Tân", "NORTH"],
  ["Long Hà", "NORTH"],
  ["Phú Riềng", "NORTH"],
  ["Phú Trung", "NORTH"],
  ["Thuận Lợi", "NORTH"],
  ["Đồng Tâm", "NORTH"],
  ["Tân Lợi", "NORTH"],
  ["Phước Sơn", "NORTH"],
  ["Nghĩa Trung", "NORTH"],
  ["Bù Đăng", "NORTH"],
  ["Thọ Sơn", "NORTH"],
  ["Đak Nhau", "NORTH"],
  ["Bom Bo", "NORTH"],
  ["Thanh Sơn", "CENTRAL"],
  ["Đak Lua", "NORTH"],
  ["Phú Lý", "CENTRAL"],
  ["Bù Gia Mập", "NORTH"],
  ["Đăk Ơ", "NORTH"],
];

const SOURCE_DOC = "NQ_30_2026_QH16 / NQ_237_2026_UBTVQH16 / NQ_1662_2025_UBTVQH15";

export const DONG_NAI_2026_UNITS: DongNaiUnitMaster[] = [
  ...WARD_NAMES_WITH_CORRIDOR.map(([canonicalName, corridor]) => ({
    canonicalName,
    normalizedName: normalizeVietnameseAdminName(canonicalName),
    unitType: "WARD" as const,
    corridor,
    officialCodeStatus: "PENDING_OFFICIAL_CODE" as const,
    boundaryStatus: "NO_OFFICIAL_POLYGON" as const,
    sourceDoc: SOURCE_DOC,
  })),
  ...COMMUNE_NAMES_WITH_CORRIDOR.map(([canonicalName, corridor]) => ({
    canonicalName,
    normalizedName:
      canonicalName === "Lộc Thạnh"
        ? "LOC THANH (NANG)"
        : normalizeVietnameseAdminName(canonicalName),
    unitType: "COMMUNE" as const,
    corridor,
    officialCodeStatus: "PENDING_OFFICIAL_CODE" as const,
    boundaryStatus: "NO_OFFICIAL_POLYGON" as const,
    sourceDoc: SOURCE_DOC,
  })),
];

export const DONG_NAI_PRE_2025_ALIASES: Array<{
  unitNormalizedName: string;
  unitType: DongNaiUnitType;
  aliasName: string;
  aliasType: "PRE_2025_NAME" | "COMMON_VARIANT" | "ABBREVIATION";
}> = [
  { unitNormalizedName: "BIEN HOA", unitType: "WARD", aliasName: "Thành phố Biên Hòa", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "BIEN HOA", unitType: "WARD", aliasName: "TP. Biên Hòa", aliasType: "ABBREVIATION" },
  { unitNormalizedName: "TRAN BIEN", unitType: "WARD", aliasName: "Trung tâm Biên Hòa cũ", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "LONG THANH", unitType: "WARD", aliasName: "Huyện Long Thành", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "LONG THANH", unitType: "WARD", aliasName: "Thị trấn Long Thành", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "NHON TRACH", unitType: "WARD", aliasName: "Huyện Nhơn Trạch", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "TRANG BOM", unitType: "WARD", aliasName: "Huyện Trảng Bom", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "DAU GIAY", unitType: "WARD", aliasName: "Thị trấn Dầu Giây", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "LONG KHANH", unitType: "WARD", aliasName: "Thành phố Long Khánh", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "DONG XOAI", unitType: "WARD", aliasName: "Thành phố Đồng Xoài", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "CHON THANH", unitType: "WARD", aliasName: "Thị xã Chơn Thành", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "PHUOC LONG", unitType: "WARD", aliasName: "Thị xã Phước Long", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "BINH LONG", unitType: "WARD", aliasName: "Thị xã Bình Long", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "TAN TRIEU", unitType: "WARD", aliasName: "Huyện Vĩnh Cửu", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "XUAN LOC", unitType: "WARD", aliasName: "Thị trấn Gia Ray", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "DINH QUAN", unitType: "COMMUNE", aliasName: "Huyện Định Quán", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "CAM MY", unitType: "COMMUNE", aliasName: "Huyện Cẩm Mỹ", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "LOC NINH", unitType: "WARD", aliasName: "Huyện Lộc Ninh", aliasType: "PRE_2025_NAME" },
  { unitNormalizedName: "PHUOC AN", unitType: "COMMUNE", aliasName: "Cụm Cảng Phước An", aliasType: "COMMON_VARIANT" },
];
