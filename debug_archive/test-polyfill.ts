if (typeof process !== 'undefined' && typeof import.meta !== 'undefined' && !(import.meta as any).env) {
  (import.meta as any).env = process.env || {};
  (import.meta as any).env.DEV = process.env.NODE_ENV !== 'production';
  (import.meta as any).env.PROD = process.env.NODE_ENV === 'production';
}

const isDev = import.meta.env.DEV;
console.log("DEV is", isDev);
