"""
Hardware check for the planned CameraIn widget (plans/device-camera-widget.md):
can this board's camera be used from CircuitPython at all, and can it be
started with WiFi up and the NTK firmware's modules already loaded?

Run it from the REPL (paste, or Thonny's Run). Set WITH_FIRMWARE = True
before it to first join WiFi the way code.py does and import
ntk_firmata_main (without starting the server), so the camera is
initialised in the same conditions a lazy init inside the firmware would
see. Prints one "CAMTEST key=value" line per result.
"""
import gc
import os
import time

try:
    WITH_FIRMWARE
except NameError:
    WITH_FIRMWARE = False


def report(key, value):
    print("CAMTEST %s=%s" % (key, value))


gc.collect()
report("with_firmware", WITH_FIRMWARE)
report("free_at_start", gc.mem_free())

import board

report("cam_pins", ",".join(sorted(n for n in dir(board) if n.startswith("CAM"))))

if WITH_FIRMWARE:
    import wifi

    t = time.monotonic()
    try:
        if str(os.getenv("NTK_WIFI_MODE") or "station").strip().lower() == "ap":
            wifi.radio.start_ap(os.getenv("NTK_AP_SSID") or "NTK-Firmata", os.getenv("NTK_AP_PASSWORD") or "netlabtoolkit")
            report("wifi", "ap %s" % wifi.radio.ipv4_address_ap)
        else:
            wifi.radio.connect(os.getenv("NTK_WIFI_SSID"), os.getenv("NTK_WIFI_PASSWORD"))
            report("wifi", "station %s" % wifi.radio.ipv4_address)
    except Exception as e:
        report("wifi_error", repr(e))
    report("wifi_s", "%.2f" % (time.monotonic() - t))
    try:
        import ntk_firmata_main  # the big module - not run(), just resident
        report("firmware_imported", True)
    except Exception as e:
        report("firmware_import_error", repr(e))
    gc.collect()
    report("free_after_firmware", gc.mem_free())

try:
    import espcamera
    report("espcamera", "present")
except ImportError as e:
    report("espcamera", "MISSING %r" % (e,))
    raise SystemExit

import busio

cam = None
try:
    t = time.monotonic()
    cam = espcamera.Camera(
        data_pins=board.CAM_DATA,
        external_clock_pin=board.CAM_XCLK,
        pixel_clock_pin=board.CAM_PCLK,
        vsync_pin=board.CAM_VSYNC,
        href_pin=board.CAM_HREF,
        i2c=busio.I2C(board.CAM_SCL, board.CAM_SDA),
        external_clock_frequency=20_000_000,
        pixel_format=espcamera.PixelFormat.JPEG,
        frame_size=espcamera.FrameSize.QVGA,
        jpeg_quality=12,
        framebuffer_count=1,
        grab_mode=espcamera.GrabMode.LATEST,
    )
    report("init_s", "%.2f" % (time.monotonic() - t))
    report("sensor", cam.sensor_name)
    report("size", "%dx%d" % (cam.width, cam.height))
    gc.collect()
    report("free_after_init", gc.mem_free())

    for label, frame_size in (("QQVGA", espcamera.FrameSize.QQVGA), ("QVGA", espcamera.FrameSize.QVGA), ("VGA", espcamera.FrameSize.VGA)):
        try:
            cam.reconfigure(frame_size=frame_size)
            time.sleep(0.5)  # let exposure settle after a size change
            cam.take(1)      # discard the first frame at the new size
            sizes = []
            times = []
            for _ in range(5):
                t = time.monotonic()
                frame = cam.take(1)
                times.append(time.monotonic() - t)
                sizes.append(len(frame) if frame is not None else 0)
                if frame is not None:
                    b = bytes(frame[:2])
            report(label, "bytes=%s ms=%s jpeg_header=%s" % (
                sizes, [int(x * 1000) for x in times], b == b"\xff\xd8"))
        except Exception as e:
            report(label + "_error", repr(e))
except Exception as e:
    report("camera_error", repr(e))
finally:
    if cam is not None:
        try:
            cam.deinit()
        except Exception:
            pass
gc.collect()
report("free_at_end", gc.mem_free())
report("done", True)
