/**
 * Test setup — mocks browser globals so vanilla JS files
 * can be loaded in a Node/jsdom context.
 */

// Mock Supabase SDK on window (the real files do window.supabase.createClient)
const mockQuery = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  then: vi.fn(),
};

globalThis.window = globalThis.window || globalThis;

window.supabase = {
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ ...mockQuery })),
    auth: {
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      setSession: vi.fn(),
    },
  })),
};

// Mock Auth global (most modules check Auth.currentUser / Auth.isAdmin)
globalThis.Auth = {
  currentUser: { id: 'test-user-id' },
  currentProfile: { id: 'test-user-id', nombre: 'Test', rol: 'admin', comision_pct: 10 },
  isAdmin: vi.fn(() => true),
};

// Mock App global
globalThis.App = {
  currentRoute: '/',
};

// Mock showToast
globalThis.showToast = vi.fn();

// localStorage is provided by jsdom, but add safety
if (!globalThis.localStorage) {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}
