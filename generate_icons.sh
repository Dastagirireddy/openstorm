#!/bin/bash
# Generate OpenStorm icons using ImageMagick or Python

# Check if Python with PIL is available
if command -v python3 &> /dev/null; then
    python3 << 'PYTHON'
from PIL import Image, ImageDraw, ImageFilter
import math

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background rounded square (dark blue gradient approximation)
    radius = size // 5
    draw.rounded_rectangle([2, 2, size-2, size-2], radius=radius, 
                           fill=(26, 26, 46, 255))
    
    # Add subtle border
    draw.rounded_rectangle([2, 2, size-2, size-2], radius=radius,
                           outline=(255, 255, 255, 25), width=2)
    
    # Lightning bolt coordinates (scaled to size)
    s = size / 512
    bolt_points = [
        (280*s, 80*s),
        (180*s, 280*s),
        (260*s, 280*s),
        (220*s, 420*s),
        (360*s, 200*s),
        (270*s, 200*s),
    ]
    
    # Draw lightning glow
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.polygon(bolt_points, fill=(255, 215, 0, 100))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size//20))
    img = Image.alpha_composite(img, glow)
    
    # Draw lightning bolt (yellow gradient approximation)
    draw.polygon(bolt_points, fill=(255, 215, 0, 255))
    draw.polygon(bolt_points, outline=(255, 140, 0, 255), width=max(2, int(3*s)))
    
    # Code brackets (cyan)
    bracket_width = max(8, int(12*s))
    left_bracket = [(120*s, 180*s), (100*s, 256*s), (120*s, 332*s)]
    right_bracket = [(392*s, 180*s), (412*s, 256*s), (392*s, 332*s)]
    
    # Scale bracket points
    left_bracket = [(x, y) for x, y in left_bracket]
    right_bracket = [(x, y) for x, y in right_bracket]
    
    draw.line([(120*s, 180*s), (100*s, 256*s), (120*s, 332*s)], 
              fill=(0, 217, 255, 255), width=bracket_width)
    draw.line([(392*s, 180*s), (412*s, 256*s), (392*s, 332*s)],
              fill=(0, 217, 255, 255), width=bracket_width)
    
    # Accent dots
    draw.ellipse([(176*s, 136*s), (184*s, 144*s)], fill=(0, 217, 255, 200))
    draw.ellipse([(336*s, 376*s), (344*s, 384*s)], fill=(0, 217, 255, 150))
    draw.ellipse([(156*s, 356*s), (164*s, 364*s)], fill=(255, 107, 107, 180))
    
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

# Create macOS icns requires iconset
import os
os.makedirs('src-tauri/icons/icon.iconset', exist_ok=True)
for w, h, name in [(16,16,'icon_16x16.png'), (32,32,'icon_16x16@2x.png'),
                    (32,32,'icon_32x32.png'), (64,64,'icon_32x32@2x.png'),
                    (128,128,'icon_128x128.png'), (256,256,'icon_128x128@2x.png'),
                    (256,256,'icon_256x256.png'), (512,512,'icon_256x256@2x.png'),
                    (512,512,'icon_512x512.png'), (1024,1024,'icon_512x512@2x.png')]:
    icon = create_icon(w)
    icon.save(f'src-tauri/icons/icon.iconset/{name}')
    print(f'Created icon.iconset/{name}')

print('Icons generated successfully!')
PYTHON
else
    echo "Python3 not available, creating placeholder icons"
    # Create simple placeholder PNGs
    for size in 32 128 256 512; do
        echo "Creating placeholder ${size}x${size} icon"
    done
fi
