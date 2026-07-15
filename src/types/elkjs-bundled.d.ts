// elkjs のブラウザ用バンドル（メインスレッド・worker不要）にはサブパスの型が無いため、
// 公式の型（'elkjs' の既定エクスポート = ELK コンストラクタ）へマップする。
declare module 'elkjs/lib/elk.bundled.js' {
  const ELKConstructor: {
    new (args?: import('elkjs').ELKConstructorArguments): import('elkjs').ELK;
  };
  export default ELKConstructor;
}
