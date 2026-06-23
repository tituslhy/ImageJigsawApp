---
name: picsum-images
description: Use this skill when loading default puzzle images from the internet. Provides correct picsum.photos URL format and CORS handling to prevent Canvas security errors.
---

# Default Images — picsum.photos

## URL Format
```
https://picsum.photos/seed/{word}/{width}/{height}
```

## The Three Default Images for JigsawIt
```js
const DEFAULT_IMAGES = [
  {
    label: '🌿 Nature',
    url: 'https://picsum.photos/seed/nature/800/600'
  },
  {
    label: '🏙️ City',
    url: 'https://picsum.photos/seed/city/800/600'
  },
  {
    label: '🎨 Abstract',
    url: 'https://picsum.photos/seed/abstract/800/600'
  }
]
```

## Critical: Always Load With CORS
```js
const img = new Image()
img.crossOrigin = "anonymous"  // Without this, Canvas throws SecurityError
img.src = url
```

The `seed` parameter makes URLs deterministic — same seed always returns
the same image. Do not use random seeds or the image will change on reload.