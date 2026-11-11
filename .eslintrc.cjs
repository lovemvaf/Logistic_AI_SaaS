module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  rules: {
    // `any` xuất hiện rất nhiều trong các controller cũ (đặc biệt là các
    // raw-SQL/Prisma proxy). Chuyển sang warning để lint còn dùng được thay vì
    // báo 500 lỗi; dần dần có thể siết lại.
    '@typescript-eslint/no-explicit-any': 'warn',
    // File nguồn cũ có khoảng trắng không chuẩn (BOM, NBSP) - không phải lỗi logic.
    'no-irregular-whitespace': 'off',
    // Biến tham chưa dùng trong tham số hàm là chủ ý ở nhiều chỗ.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};
