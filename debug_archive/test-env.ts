const dev = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.DEV : false;
console.log(dev);
