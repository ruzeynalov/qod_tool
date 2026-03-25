import nextConfig from 'eslint-config-next';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.next/**'],
  },
  ...nextConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
];
