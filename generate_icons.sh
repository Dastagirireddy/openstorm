#!/bin/bash
# Generate OpenStorm icons - Blue Rhombus on Dark with AI Texture

if command -v python3 &> /dev/null; then
    python3 << 'PYTHON'
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

def create_icon(size):
    render_size = size * 2
    img = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    s = render_size / 512
    cx, cy = render_size // 2, render_size // 2
    
    # Greyish black background
    bg = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    radius = int(100 * s)
    bg_draw.rounded_rectangle([int(20*s), int(20*s), int(492*s), int(492*s)], 
                               radius=radius, fill=(35, 35, 45, 255))
    
    mask = Image.new('L', (render_size, render_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([int(20*s), int(20*s), int(492*s), int(492*s)], 
                                radius=radius, fill=255)
    bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)
    
    # AI texture lines
    texture = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    texture_draw = ImageDraw.Draw(texture)
    for y in range(int(50*s), int(462*s), int(30*s)):
        texture_draw.line([(int(50*s), y), (int(462*s), y)], fill=(53, 116, 240, 15), width=1)
    for x in range(int(50*s), int(462*s), int(30*s)):
        texture_draw.line([(x, int(50*s)), (x, int(462*s))], fill=(53, 116, 240, 15), width=1)
    img = Image.alpha_composite(img, texture)
    
    # Blue rounded rhombus
    rhombus_size = int(320 * s)
    rhombus_radius = int(40 * s)
    rhombus_base = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    rhombus_draw = ImageDraw.Draw(rhombus_base)
    rhombus_draw.rounded_rectangle(
        [cx - rhombus_size//2, cy - rhombus_size//2, 
         cx + rhombus_size//2, cy + rhombus_size//2],
        radius=rhombus_radius,
        fill=(53, 116, 240, 255)
    )
    rhombus_base = rhombus_base.rotate(45, expand=False, center=(cx, cy), resample=Image.BICUBIC)
    img = Image.alpha_composite(img, rhombus_base)
    
    # Glow
    glow = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_r = int(180 * s)
    glow_draw.ellipse([cx - glow_r, cy - glow_r, cx + glow_r, cy + glow_r], fill=(53, 116, 240, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(1, int(20 * s))))
    img = Image.alpha_composite(img, glow)
    
    # "OS" text
    draw = ImageDraw.Draw(img)
    font_size = int(160 * s)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    text = "OS"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (render_size - tw) // 2
    ty = (render_size - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))
    
    img = img.resize((size, size), Image.LANCZOS)
    return img

# Generate all required icon sizes
sizes = [
    (32, 32, '32x32.png'),
    (128, 128, '128x128.png'),
    (256, 256, '128x128@2x.png'),
    (512, 512, 'icon.png'),
]

for w, h, name in sizes:
    icon = create_icon(w)
    icon.save(f'src-tauri/icons/{name}')
    print(f'Created {name}')

# Create macOS icns iconset
os.makedirs('src-tauri/icons/icon.iconset', exist_ok=True)
for w, h, name in [(16,16,'icon_16x16.png'), (32,32,'icon_16x16@2x.png'),
                    (32,32,'icon_32x32.png'), (64,64,'icon_32x32@2x.png'),
                    (128,128,'icon_128x128.png'), (256,256,'icon_128x128@2x.png'),
                    (256,256,'icon_256x256.png'), (512,512,'icon_256x256@2x.png'),
                    (512,512,'icon_512x512.png'), (1024,1024,'icon_512x512@2x.png')]:
    icon = create_icon(w)
    icon.save(f'src-tauri/icons/icon.iconset/{name}')
    print(f'Created icon.iconset/{name}')

# Generate ICO
ico_images = [Image.open(f'src-tauri/icons/icon.iconset/icon_{s}x{s}.png') for s in [16, 32, 128, 256]]
ico_images[2].save('src-tauri/icons/icon.ico', format='ICO', 
                   sizes=[(16,16), (32,32), (48,48), (128,128), (256,256)],
                   append_images=ico_images[:2])
print('Created icon.ico')

# Generate ICNS
os.system('cd src-tauri/icons && iconutil -c icns icon.iconset -o icon.icns')
print('Created icon.icns')

# Save to assets
icon_512 = create_icon(512)
icon_512.save('assets/icon-512.png')
print('Created assets/icon-512.png')

print('Icons generated successfully!')
PYTHON
else
    echo "Python3 not available, cannot generate icons"
    exit 1
fi