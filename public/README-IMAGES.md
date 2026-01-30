# Required Images for InsurAI

This document lists the images that need to be created for full SEO and PWA functionality.

## OG Image (Social Sharing)

**File**: `public/og-image.png`
**Dimensions**: 1200 x 630 pixels
**Purpose**: Displayed when sharing links on Facebook, LinkedIn, Twitter, etc.

### Design Requirements
- Brand name "InsurAI" prominent
- Tagline: "AI Sigorta Analiz Platformu"
- Blue gradient background (#2563eb to #4f46e5)
- Sample policy analysis visual or dashboard mockup
- Turkish and English elements

### Quick Creation Options

1. **Canva** (Recommended)
   - Go to canva.com
   - Search for "LinkedIn Post" template (similar dimensions)
   - Customize with brand colors and text

2. **Figma**
   - Create 1200x630 frame
   - Use brand colors from design system

3. **Placeholder** (Temporary)
   - Use a solid blue (#2563eb) background with white text

## PWA Icons

**Location**: `public/icons/`

### Required Sizes
| File | Size | Purpose |
|------|------|---------|
| icon-72x72.png | 72x72 | Android notification |
| icon-96x96.png | 96x96 | Android splash |
| icon-128x128.png | 128x128 | Chrome web store |
| icon-144x144.png | 144x144 | MS tile |
| icon-152x152.png | 152x152 | Apple touch |
| icon-192x192.png | 192x192 | Android home screen |
| icon-384x384.png | 384x384 | Android splash HD |
| icon-512x512.png | 512x512 | PWA install |

### Icon Design
- Simple logo/symbol that works at small sizes
- Should be recognizable at 72x72
- Use brand blue (#2563eb) as primary color
- Consider maskable icon format for Android

### Generation Tools
1. **PWA Icon Generator**: https://www.pwabuilder.com/imageGenerator
2. **Real Favicon Generator**: https://realfavicongenerator.net
3. **Favicon.io**: https://favicon.io

## Screenshots (PWA)

**Location**: `public/screenshots/`

### Required Screenshots
| File | Size | Purpose |
|------|------|---------|
| dashboard.png | 1280x720 | Desktop store listing |
| mobile.png | 390x844 | Mobile store listing |

### Screenshot Content
- **dashboard.png**: Main dashboard with sample policies, showing the value proposition
- **mobile.png**: Mobile view of policy detail or upload flow

## Temporary Workaround

Until proper images are created, you can use placeholder services:

```html
<!-- OG Image Placeholder -->
<meta property="og:image" content="https://via.placeholder.com/1200x630/2563eb/ffffff?text=InsurAI" />
```

Note: This is not recommended for production as:
1. It looks unprofessional
2. Some social platforms cache images
3. Doesn't represent your brand

## Action Items

- [ ] Create og-image.png (1200x630)
- [ ] Create icons directory with all sizes
- [ ] Create dashboard screenshot
- [ ] Create mobile screenshot
- [ ] Upload all to public/ directory
- [ ] Test with Facebook Debugger: https://developers.facebook.com/tools/debug/
- [ ] Test with Twitter Card Validator: https://cards-dev.twitter.com/validator

---

*Note: Run `npm run build` after adding images to include them in the build.*
