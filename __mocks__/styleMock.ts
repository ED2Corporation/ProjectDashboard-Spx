const styles = new Proxy({}, {
  get: (_target, prop) => String(prop),
});

export default styles;
