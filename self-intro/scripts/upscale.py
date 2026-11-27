"""Upscale an image 4x with Real-ESRGAN weights via spandrel (CPU). usage: upscale.py model.pth in.png out.png"""
import sys, torch, numpy as np
from PIL import Image
from spandrel import ModelLoader
torch.set_num_threads(4)
m = ModelLoader().load_from_file(sys.argv[1]).eval()
im = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(np.float32) / 255
x = torch.from_numpy(im).permute(2, 0, 1)[None]
with torch.no_grad():
    y = m(x)[0].clamp(0, 1).permute(1, 2, 0).numpy()
Image.fromarray((y * 255 + .5).astype(np.uint8)).save(sys.argv[3])
