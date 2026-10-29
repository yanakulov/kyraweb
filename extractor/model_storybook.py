"""Build the opening folio from the supplied retail cover, with Blender 5.2.

blender --background --python extractor/model_storybook.py -- /path/to/cover.jpg
Optional --render writes inspection images to .reference/storybook/.
The GLB uses Three.js coordinates: y up; CoverHinge rotates around z.
"""
import argparse
import gzip
import hashlib
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument("cover", type=Path)
args.add_argument("--render", action="store_true")
args.add_argument("--export-only", action="store_true", help="Skip fallback and proof renders when only geometry changes")
opt = args.parse_args(sys.argv[sys.argv.index("--") + 1:])
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/interface"
REF = ROOT / ".reference/storybook"
REF.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
rng = np.random.default_rng(1992)


def xyz(p):
    return (p[0], -p[2], p[1])


def image(name, pixels, jpeg=False):
    h, w = pixels.shape[:2]
    im = bpy.data.images.new(name, width=w, height=h, alpha=False)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(pixels, 0, 1)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(REF / (name + (".jpg" if jpeg else ".png")))
    im.file_format = "JPEG" if jpeg else "PNG"
    im.save()
    return im


def material(name, color, metallic=0, roughness=.55, texture=None, normal=None, roughness_map=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Metallic"].default_value = metallic
    bs.inputs["Roughness"].default_value = roughness
    if texture:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = texture
        m.node_tree.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
    if normal:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = normal
        normal.colorspace_settings.name = "Non-Color"
        bump = m.node_tree.nodes.new("ShaderNodeNormalMap")
        m.node_tree.links.new(tex.outputs["Color"], bump.inputs["Color"])
        m.node_tree.links.new(bump.outputs["Normal"], bs.inputs["Normal"])
    if roughness_map:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = roughness_map
        roughness_map.colorspace_settings.name = "Non-Color"
        m.node_tree.links.new(tex.outputs["Color"], bs.inputs["Roughness"])
    return m


def mesh(name, vertices, faces, mat, uv=None, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if uv:
        layer = data.uv_layers.new()
        for poly in data.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uv[data.loops[li].vertex_index]
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def bevel(obj, width=.04, segments=4):
    mod = obj.modifiers.new("Soft handmade edges", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod = obj.modifiers.new("Weighted surface normals", "WEIGHTED_NORMAL")
    mod.keep_sharp = True
    return obj


def box(name, pos, size, mat, width=.04, parent=None, uv_scale=None, uv_offset=(0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Cube-atlas UVs stretch a quarter of a texture over a whole 72-unit plank.
    # Project each face in local physical units instead, before beveling.
    if uv_scale:
        uv = obj.data.uv_layers.active
        for face in obj.data.polygons:
            axes = [i for i in range(3) if i != max(range(3),key=lambda j: abs(face.normal[j]))]
            for li in face.loop_indices:
                co = obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv = tuple(co[axis]*uv_scale[i]+uv_offset[i] for i,axis in enumerate(axes))
    obj.data.materials.append(mat)
    bevel(obj, width)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def tube(name, points, radius, mat, parent=None):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 3
    poly = data.splines.new("POLY")
    poly.points.add(len(points) - 1)
    for p, coord in zip(poly.points, points):
        p.co = (*xyz(coord), 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def lathe(name, pos, profile, mat, segments=64):
    verts = [(pos[0] + r*math.cos(a*math.tau/segments), pos[1]+h,
              pos[2]+r*math.sin(a*math.tau/segments))
             for h, r in profile for a in range(segments)]
    faces = [(j*segments+i, (j+1)*segments+i,
              (j+1)*segments+(i+1)%segments, j*segments+(i+1)%segments)
             for j in range(len(profile)-1) for i in range(segments)]
    faces.extend([tuple(range(segments)),
                  tuple((len(profile)-1)*segments+i for i in range(segments-1, -1, -1))])
    return smooth(mesh(name, verts, faces, mat))


def normal_map(height, strength):
    dy, dx = np.gradient(height)
    n = np.stack((-dx*strength, -dy*strength, np.ones_like(height)), axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n*.5+.5


# Original pixels, not a newly drawn cover. The monochrome tooling preserves
# Malcolm, Brandon, the forest, Fables & Fiends and original Kyrandia lettering.
source = bpy.data.images.load(str(opt.cover.resolve()))
source.scale(1024, 1024)
original = np.array(source.pixels[:], dtype=np.float32).reshape(1024, 1024, 4)[:, :, :3]
light = original @ np.array([.299, .587, .114])
light = (light + np.roll(light, 1, 0) + np.roll(light, 1, 1))/3
tonal = np.clip((light-.055)/.81, 0, 1)
# Keep dark oxblood between the original details, with worn gold on the high
# points and contours. The original red title lettering receives the same foil.
dy,dx=np.gradient(light)
edges=np.clip(np.hypot(dx,dy)*10,0,1)
red_lettering=np.clip((original[:,:,0]-np.maximum(original[:,:,1],original[:,:,2]))*2.5,0,1)
foil=np.clip(tonal**1.7*.72+edges*.65+red_lettering*.68,0,1)
cover_rng=np.random.default_rng(1992)
wear=cover_rng.random((1024,1024))
gold=np.array([.91,.63,.25])
dark=np.array([.10,.014,.008])
cover_pixels=dark+(gold-dark)*foil[:,:,None]
cover_pixels *= (.94+.06*wear)[:,:,None]
cover_image = image("original-cover-tooling", cover_pixels, jpeg=True)
cover_normal = image("original-cover-normal", normal_map(light[::2, ::2], 3.2))
cover_mat = material("Original retail art - gold leather relief", (1,1,1), .48, .58, cover_image, cover_normal)
# One small packed map: green is roughness, blue is metalness. Gold catches
# grazing light while the recessed red leather stays matte and nonmetallic.
small_foil=foil[::4,::4]
pbr=np.ones((256,256,3))
pbr[:,:,1]=.80-.31*small_foil
pbr[:,:,2]=.06+.78*small_foil
cover_pbr=image("worn-gold-material",pbr,jpeg=True)
cover_pbr.colorspace_settings.name="Non-Color"
tex=cover_mat.node_tree.nodes.new("ShaderNodeTexImage");tex.image=cover_pbr
channels=cover_mat.node_tree.nodes.new("ShaderNodeSeparateColor")
cover_mat.node_tree.links.new(tex.outputs["Color"],channels.inputs["Color"])
bs=cover_mat.node_tree.nodes.get("Principled BSDF")
cover_mat.node_tree.links.new(channels.outputs["Green"],bs.inputs["Roughness"])
cover_mat.node_tree.links.new(channels.outputs["Blue"],bs.inputs["Metallic"])

# Small repeatable material maps keep the GLB compact and work in glTF viewers.
y, x = np.mgrid[0:256, 0:256]
grain = rng.random((256, 256))
grain = (grain + np.roll(grain,1,0) + np.roll(grain,1,1))/3
cells=rng.random((24,24,2))
gx,gy=x*24/256,y*24/256
ix,iy=gx.astype(int),gy.astype(int)
distance=np.full((256,256),10.)
for dx in [-1,0,1]:
    for dy in [-1,0,1]:
        seed=cells[(iy+dy)%24,(ix+dx)%24]
        distance=np.minimum(distance,(gx-ix-dx-seed[:,:,0])**2+(gy-iy-dy-seed[:,:,1])**2)
pebble=np.clip(1-distance*1.6,0,1)
age=grain.copy()
for shift in [1,2,4,8,16]:
    age=(age+np.roll(age,shift,0)+np.roll(age,shift,1))/3
age=(age-age.min())/(age.max()-age.min())
leather_pixels=np.array([.24,.035,.018])[None,None,:]*(.64+.58*age[:,:,None])*(.92+.12*pebble[:,:,None])
leather_image = image("oxblood-leather",leather_pixels,jpeg=True)
leather_normal = image("leather-grain",normal_map(pebble*.85+grain*.15,1.15))
leather_roughness=image("leather-roughness",np.repeat((.79-.16*pebble+.09*age)[:,:,None],3,axis=2),jpeg=True)
leather = material("Oxblood calf leather", (.24,.035,.018), 0, .72, leather_image, leather_normal, leather_roughness)
marble = np.sin(x*.095 + 2.1*np.sin(y*.025) + .45*np.sin((x+y)*.035))
marble = .88 + .055*marble + .02*np.sin(x*.8+y*.3) + .035*grain
endpaper_image = image("marbled-endpaper", np.array([.32,.23,.15])[None,None,:]*marble[:,:,None], jpeg=True)
paper_normal=image("paper-fibers-normal",normal_map(grain,.35))
inside = material("Marbled inside endpaper", (.35,.19,.10), 0, .93, endpaper_image, paper_normal)
brass = material("Antique brass", (.47,.28,.075), .78, .43)
gold_edge = material("Old gilded tooling", (.74,.50,.19), .70, .42)
paper_image = image("parchment-fibers", np.array([.72,.63,.46])[None,None,:]*(.93+.10*grain[:,:,None]), jpeg=True)
parchment = material("Ivory parchment", (.68,.57,.38), 0, .89, paper_image)
edge_grain = .8 + .10*np.sin(y*2.8) + grain*.08
page_image = image("leaf-edges", np.array([.56,.43,.27])[None,None,:]*edge_grain[:,:,None], jpeg=True)
page_edge = material("Warm paper edges", (.47,.36,.20), 0, .85, page_image)
ribbon_mat = material("Crimson silk bookmark", (.19,.016,.027), .08, .47)

# Reuse the first storybook's illustrated timber: knots, scars and worn grain.
# The plank seams are already in this map, so use one solid tabletop beneath it.
timber = bpy.data.images.load(str(ROOT / "extractor/materials/aged-walnut.webp"))
wood_pixels = np.array(timber.pixels[:], dtype=np.float32).reshape(timber.size[1], timber.size[0], 4)[:,:,:3]
wood_image = image("walnut-table", wood_pixels, jpeg=True)
wood_grain = wood_pixels[::2,::2] @ np.array([.299,.587,.114])
wood_normal = image("walnut-grain", normal_map(wood_grain, 2.2))
wood_roughness = image("walnut-roughness", np.repeat(np.clip(.94-wood_grain*.30,.73,.94)[:,:,None],3,axis=2), jpeg=True)
wood = material("Worn walnut tabletop", (.13,.06,.022), 0, .92, wood_image, wood_normal, wood_roughness)
box("Walnut tabletop", (0,-.37,0), (55,.42,72), wood, .035, uv_scale=(1/15,1/15), uv_offset=(.5,.5))

# Closed book; its hinge is an exported empty, never merged into the cover.
box("Back leather board", (0,-.045,0), (3.13,.16,4.15), leather, .07, uv_scale=(1.2,1.2))
box("Page block", (.025,.178,0), (2.96,.36,3.94), page_edge, .045)
# Individual leaves make the fore-edge visible without dense geometry.
for i in range(22):
    h = .014 + i*.0152
    box(f"Leaf edge {i+1}", (.028,h,0), (2.967,.006,3.947), parchment, .002)
box("Blank right parchment", (.025,.365,0), (2.94,.01,3.91), parchment, .025)
hinge = bpy.data.objects.new("CoverHinge", None)
bpy.context.collection.objects.link(hinge)
hinge.location = xyz((-1.55,.44,0))
hinge["sourceCoverSHA256"] = hashlib.sha256(opt.cover.read_bytes()).hexdigest()
hinge["sourceCoverTreatment"] = "Original pixels preserved as square bronze/leather relief; no redrawn artwork."
bpy.context.view_layer.update()
box("Leather front board", (0,.44,0), (3.1,.12,4.1), leather, .07, hinge, uv_scale=(1.2,1.2))
box("Front board suede lining", (0,.375,0), (2.93,.012,3.93), inside, .04, hinge, uv_scale=(.75,.75))
for inset in [.25,.31]:
    xx,zz=1.55-inset,2.05-inset
    tube("Inside stamped border",[(-xx,.361,-zz),(xx,.361,-zz),(xx,.361,zz),(-xx,.361,zz),(-xx,.361,-zz)],.006,brass,hinge)
# An original-lettering bookplate on the inside, using the same cover atlas.
# The reversed U coordinates read correctly after the cover rotates 180°.
box("Inside folio bookplate",(0,.353,-.12),(1.92,.012,1.12),parchment,.025,hinge)
def bookplate_label(name,width,depth,z,uv_rect):
    u0,v0,u1,v1=uv_rect
    return mesh(name,[(-width/2,.345,z+depth/2),(width/2,.345,z+depth/2),
                       (width/2,.345,z-depth/2),(-width/2,.345,z-depth/2)],
                [(3,2,1,0)],cover_mat,[(u1,v0),(u0,v0),(u0,v1),(u1,v1)],hinge)
bookplate_label("Original Fables and Fiends bookplate",1.58,.30,-.32,(.385,.850,.590,.890))
bookplate_label("Original Book One bookplate",.95,.18,.10,(.394,.681,.579,.713))

# The binding belongs to the fixed back board, below the page surface.
# Parenting it to the lid turned its lower edge into an upright fin when open.
for band,z in enumerate([-1.45,-.50,.50,1.45]):
    points = [(-1.48-.14*math.sin(t), .135+.215*math.cos(t), z)
              for t in np.linspace(0, math.pi, 25)]
    tube(f"Raised spine band {band}", points, .018, leather)
spine_verts = [(-1.48-.14*math.sin(t), .135+.215*math.cos(t), z)
               for z in [-2.01,2.01] for t in np.linspace(0, math.pi, 33)]
spine_faces = [(i,i+1,i+34,i+33) for i in range(32)]
spine_uv=[(i/32*.5,z*1.2) for z in [-2.01,2.01] for i in range(33)]
spine=smooth(mesh("Rounded leather spine", spine_verts, spine_faces, leather, spine_uv))
assert spine.parent is None and max(v[1] for v in spine_verts) < .37

# Fine gilded border, inlaid square artwork and real outward relief.
for inset, radius in [(0.13,.013),(0.20,.006)]:
    xx, zz = 1.55-inset, 2.05-inset
    tube("Gilt cover rule", [(-xx,.507,-zz),(xx,.507,-zz),(xx,.507,zz),(-xx,.507,zz),(-xx,.507,-zz)], radius, gold_edge, hinge)
N=81
verts=[]; uv=[]
for row in range(N):
    v=row/(N-1)
    for col in range(N):
        u=col/(N-1)
        emboss=float(tonal[min(1023,round(v*1023)), min(1023,round(u*1023))])
        verts.append(((u-.5)*2.65, .507+emboss*.024, (.5-v)*2.65-.07))
        uv.append((u,v))
faces=[(r*N+c,r*N+c+1,(r+1)*N+c+1,(r+1)*N+c) for r in range(N-1) for c in range(N-1)]
smooth(mesh("Original cover bas relief",verts,faces,cover_mat,uv,hinge))
for z in [-1.44,1.30]:
    tube("Artwork frame",[(-1.365,.513,z),(1.365,.513,z)],.012,brass,hinge)
for x in [-1.365,1.365]:
    tube("Artwork frame",[(x,.513,-1.44),(x,.513,1.30)],.012,brass,hinge)

# Brass corner protectors are thin curved plates, not oversized gems.
for sx in [-1,1]:
    for sz in [-1,1]:
        points=[(sx*1.43,.519,sz*1.61),(sx*1.43,.519,sz*1.91),(sx*1.12,.519,sz*1.91)]
        tube("Brass corner protector",points,.043,brass,hinge)
        tube("Corner engraved line",[(sx*1.36,.526,sz*1.62),(sx*1.36,.526,sz*1.84),(sx*1.13,.526,sz*1.84)],.008,gold_edge,hinge)
        for px,pz in [(sx*1.43,sz*1.65),(sx*1.16,sz*1.91)]:
            obj=lathe("Corner rivet",(px,.52,pz),[(0,.025),(.012,.022),(.021,.008)],gold_edge,16)
            obj.parent=hinge; obj.matrix_parent_inverse=hinge.matrix_world.inverted()
for z in [-1.68,1.60]:
    points=[(t*.56,.514,z+.065*math.sin(t*math.tau)) for t in np.linspace(-1,1,65)]
    tube("Tooled flourish",points,.008,gold_edge,hinge)
    tube("Tooled flourish",[(x,y,z*2-pz) for x,y,pz in points],.008,gold_edge,hinge)

# A silk marker extends beyond the lower fore-edge and follows its bend.
mesh("Silk bookmark",[(.62,.372,1.45),(.78,.372,1.45),(.62,.372,1.96),(.78,.372,1.96),
                       (.62,-.04,2.17),(.78,-.04,2.17),(.62,-.12,2.48),(.70,-.12,2.39),(.78,-.12,2.48)],
     [(2,3,1,0),(4,5,3,2),(6,7,8,5,4)],ribbon_mat)

# A turned brass candlestick, safely outside the opening cover's swept volume.
C=(3.6,-.14,-1.8)
# At any opening angle the cover is inside a cylinder of radius 3.2 about
# its hinge. Even this conservative bound stays 1.41 units from the candle.
assert C[0] - .54 > -1.55 + 3.2
print(f"Cover/candle horizontal safety margin: {C[0]-.54-(-1.55+3.2):.2f}")
candle_start = set(bpy.context.scene.objects)
profile=[(0,.51),(.035,.54),(.07,.54),(.11,.49),(.14,.42),(.18,.39),(.20,.29),
         (.25,.26),(.29,.20),(.35,.15),(.40,.13),(.46,.18),(.51,.19),(.56,.16),
         (.59,.12),(.92,.095),(.96,.13),(1.00,.16),(1.05,.18),(1.09,.14),
         (1.16,.12),(1.20,.25),(1.24,.34),(1.27,.37),(1.31,.37),(1.34,.32),
         (1.32,.27),(1.29,.15),(1.42,.14),(1.45,.17)]
lathe("Turned brass candlestick",C,profile,brass,64)
wax=material("Warm ivory beeswax",(.72,.57,.33),0,.67)
waxdark=material("Melted wax recess",(.27,.15,.045),0,.73)
lathe("Beeswax candle",(C[0],C[1]+1.35,C[2]),[(0,.13),(.03,.15),(.48,.145),(.56,.138),(.57,.105),(.54,.06)],wax,64)
lathe("Candle molten well",(C[0],C[1]+1.89,C[2]),[(0,.105),(.008,.08)],waxdark,48)
for i in range(9):
    a=i*math.tau/9+.18
    length=.09+.25*float(rng.random())
    pts=[(C[0]+r*math.cos(a),C[1]+1.90-h,C[2]+r*math.sin(a)) for h,r in [(0,.125),(.03,.146),(length*.7,.151),(length,.148)]]
    tube("Melted beeswax drip",pts,.014+(i%3)*.004,wax)
wick=material("Charred wick",(.013,.008,.003),0,.9)
tube("Wick",[(C[0],C[1]+1.89,C[2]),(C[0]+.013,C[1]+1.99,C[2])],.009,wick)
flame=material("Candle flame",(1,.38,.025),0,.3)
bs=flame.node_tree.nodes.get("Principled BSDF")
bs.inputs["Emission Color"].default_value=(1,.24,.012,1)
bs.inputs["Emission Strength"].default_value=4
lathe("Candle flame",(C[0],C[1]+1.96,C[2]),[(0,.025),(.035,.055),(.08,.063),(.14,.052),(.21,.031),(.29,.011),(.34,0)],flame,32)
candle_objects = set(bpy.context.scene.objects) - candle_start
candle_root=bpy.data.objects.new("CandleRoot",None)
bpy.context.collection.objects.link(candle_root)
candle_root.location=xyz(C)
bpy.context.view_layer.update()
for obj in candle_objects:
    obj.parent=candle_root
    obj.matrix_parent_inverse=candle_root.matrix_world.inverted()

# Pack the source-derived maps into the GLB; no runtime modeling is needed.
for obj in list(bpy.context.scene.objects):
    if obj.type == "CURVE":
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj.select_set(False)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(REF/"storybook.glb"), export_format="GLB",
                          use_selection=True, export_apply=True, export_cameras=False,
                          export_lights=False, export_yup=True, export_extras=True,
                          export_image_format="AUTO")
(OUT/"storybook.glb.gz").write_bytes(gzip.compress((REF/"storybook.glb").read_bytes(), compresslevel=9, mtime=0))
for im in bpy.data.images:
    if im.filepath and im != source:
        im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(REF/"storybook.blend"))
print(f"Packed GLB: {(OUT/'storybook.glb.gz').stat().st_size:,} bytes")
print(f"Source SHA256: {hinge['sourceCoverSHA256']}")
if opt.export_only:
    sys.exit(0)

scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.world.color=(.12,.12,.12)
bpy.ops.object.camera_add(location=xyz((0,9,.001)))
camera=bpy.context.object
camera.rotation_euler=(Vector(xyz((0,.44,0)))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type="ORTHO"; camera.data.ortho_scale=4.6
scene.camera=camera
for pos,power,color,size in [((0,6,2),1000,(1,.78,.53),7),((-4,4,-4),650,(.48,.62,1),5),((3.6,2,-1.8),60,(1,.44,.13),1)]:
    bpy.ops.object.light_add(type="AREA",location=xyz(pos))
    light=bpy.context.object; light.data.energy=power; light.data.color=color; light.data.shape="DISK"; light.data.size=size
    light.rotation_euler=(Vector(xyz((0,.2,0)))-light.location).to_track_quat('-Z','Y').to_euler()
scene.view_settings.view_transform="AgX"
# A render of this same model replaces the invented fallback artwork.
for obj in scene.objects:
    obj.hide_render = obj.name.startswith("Walnut table") or obj in candle_objects
scene.render.film_transparent=True
scene.render.resolution_x=512; scene.render.resolution_y=680; scene.render.resolution_percentage=100
scene.render.image_settings.file_format="WEBP"
scene.render.image_settings.color_mode="RGBA"
scene.render.image_settings.quality=90
scene.render.filepath=str(OUT/"book-cover.webp")
bpy.ops.render.render(write_still=True)

if opt.render:
    for obj in scene.objects:
        obj.hide_render=False
    scene.render.film_transparent=False
    scene.render.image_settings.file_format="PNG"
    camera.location=xyz((6,9,9))
    camera.rotation_euler=(Vector(xyz((.5,.2,-.2)))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=10.5
    scene.render.resolution_x=1400; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
    scene.render.filepath=str(REF/"storybook-render.png")
    bpy.ops.render.render(write_still=True)
    hinge.rotation_euler.y=-math.pi
    camera.location=xyz((2.5,10,8))
    camera.rotation_euler=(Vector(xyz((-.8,.2,-.2)))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=11.5
    scene.render.filepath=str(REF/"storybook-open.png")
    bpy.ops.render.render(write_still=True)
