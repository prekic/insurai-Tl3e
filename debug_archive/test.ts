import { extractVehicleInfoFromText } from './src/pipelines/extractVehicleInfoFromText.ts';

const text = `
  .XOODQÖP7DU]Ö &LQVL KAMYONET Marka ISUZU
  Marka Tipi '0$;dù)7.$%ù1
  Tipi d(.ù'(0ù5ù%$*$-+$98=8g1
  Model Bilgisi 2013 Plaka Il Kodu ZONGULDAK
  Plaka No 67UA659 Motor No KM3182
`;

console.log(extractVehicleInfoFromText(text));
