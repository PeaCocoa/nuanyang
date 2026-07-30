from PIL import Image
import os

src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons", "icon-512.png")
icon_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")

img = Image.open(src)
print(f"原图尺寸: {img.size}")

sizes = [192, 256, 384, 512]
maskable_sizes = [192, 512]

for size in sizes:
    out = os.path.join(icon_dir, f"icon-{size}.png")
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(out, "PNG")
    print(f"  生成 icon-{size}.png ({size}x{size})")

# 生成 maskable 图标（带内边距，安卓自适应图标）
for size in maskable_sizes:
    out = os.path.join(icon_dir, f"maskable-{size}.png")
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    inner_size = int(size * 0.8)
    inner = img.resize((inner_size, inner_size), Image.LANCZOS)
    offset = (size - inner_size) // 2
    canvas.paste(inner, (offset, offset), inner if inner.mode == "RGBA" else None)
    canvas.save(out, "PNG")
    print(f"  生成 maskable-{size}.png ({size}x{size})")

# 生成 favicon
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "favicon.png")
img.resize((32, 32), Image.LANCZOS).save(out, "PNG")
print(f"  生成 favicon.png (32x32)")

print("完成!")
