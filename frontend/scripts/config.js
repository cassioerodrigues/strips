// Runtime config do frontend Stirps.
//
// Carregado ANTES de qualquer outro script (React, Babel, componentes), o
// objeto window.STIRPS_CONFIG deve ser a única fonte de configuração pública
// usada pelos componentes. Componentes NUNCA devem hardcodar URL de API,
// URL do Supabase ou chave anon — leiam sempre de window.STIRPS_CONFIG.
//
// IMPORTANTE: este arquivo é servido publicamente. Coloque AQUI somente
// valores públicos:
//   - apiBaseUrl       URL base da API Stirps (ex.: "/api" ou
//                      "http://localhost:8001/api")
//   - supabaseUrl      URL pública do projeto Supabase
//   - supabaseAnonKey  chave anon (publishable) do Supabase — NUNCA a
//                      service-role key.
//
// Em produção via Docker / EasyPanel, este arquivo é reescrito no boot do
// container a partir de /etc/strips/config.js.template via envsubst, usando
// as variáveis de ambiente STIRPS_API_BASE_URL, STIRPS_SUPABASE_URL e
// STIRPS_SUPABASE_ANON_KEY. Veja frontend/README.md.
window.STIRPS_CONFIG = {
  apiBaseUrl: "http://localhost:8001/api",
  supabaseUrl: "",
  supabaseAnonKey: ""
};
