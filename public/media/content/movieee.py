from moviepy.editor import ImageClip, concatenate_videoclips
import random

# Parameters
image_files = [
    "apl1.jpg", "apl2.jpg", "apl3.jpg", "apl4.jpg",
    "apl5.jpg", "apl6.jpg", "apl7.jpg", "apl8.jpg",
    "apl9.jpg", "apl10.jpg", "apl11.jpg", "apl12.jpg"
]  # Replace with your actual image paths
output_video = "apl.mp4"
duration_per_image = 5  # seconds
zoom_factor = 0.1  # 10% zoom
fps = 30

def create_zoom_effect(image_file, duration, zoom_factor):
    clip = ImageClip(image_file, duration=duration)
    
    # Generate random zoom center
    width, height = clip.size
    zoom_x = random.uniform(0.3, 0.7) * width
    zoom_y = random.uniform(0.3, 0.7) * height

    # Apply zoom-in and zoom-out effects
    def make_frame(t):
        scale = 1 + zoom_factor * (t / duration) if t < duration / 2 else 1 + zoom_factor * (1 - t / duration)
        new_width = int(width * scale)
        new_height = int(height * scale)
        cropped = clip.crop(
            x_center=zoom_x, y_center=zoom_y, width=new_width, height=new_height
        )
        return cropped.get_frame(t)

    return clip.fl(make_frame)

def create_slideshow(image_files, duration_per_image, zoom_factor):
    clips = [
        create_zoom_effect(image, duration_per_image, zoom_factor)
        for image in image_files
    ]
    return concatenate_videoclips(clips, method="compose")

# Create and save the video
slideshow = create_slideshow(image_files, duration_per_image, zoom_factor)
slideshow.write_videofile(output_video, fps=fps, codec="libx264")

print(f"Slideshow video created and saved as {output_video}")
