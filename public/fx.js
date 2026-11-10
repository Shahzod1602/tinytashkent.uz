// Atmosphere layer: re-lights the baked isometric map on the GPU.
// The 2D map canvas is uploaded as a texture; a fragment shader classifies
// pixels by colour (foliage, water, roofs, facades, roads) and applies season,
// time-of-day and weather on top. No tiles are re-baked.

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){ v_uv = a_pos*.5+.5; gl_Position = vec4(a_pos,0.,1.); }`;

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;      // CSS pixels
uniform vec3 u_cam;      // world x, world y, zoom
uniform float u_time;
uniform vec3 u_mul;
uniform vec3 u_add;
uniform float u_night;   // 0 day .. 1 deep night
uniform float u_lit;     // share of windows switched on (evening, overcast, rain...)
uniform float u_lamp;    // street lighting
uniform float u_sun;     // direct sun strength (glints, cloud shadows)
uniform float u_warm;    // golden-hour glow
uniform vec3 u_season;   // spring, autumn, bare (leafless) weights
uniform float u_cover;   // snow on the ground
uniform float u_rain;
uniform float u_snow;
uniform float u_cloud;
uniform float u_wet;
uniform float u_fog;
uniform float u_flash;
uniform float u_px;      // pixel-art cell size in CSS px (0 = off)
uniform float u_levels;  // colour steps per channel in pixel-art mode

float hash(vec2 p){
  p = mod(p, 1024.);
  vec3 p3 = fract(vec3(p.xyx)*.1031);
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y);
}
float fbm(vec2 p){ return .55*vnoise(p)+.3*vnoise(p*2.03+17.)+.15*vnoise(p*4.01+41.); }

float bayer2(vec2 a){ a = floor(a); return fract(a.x/2.+a.y*a.y*.75); }
float bayer4(vec2 a){ return bayer2(.5*a)*.25+bayer2(a); }

void main(){
  vec2 css = vec2(v_uv.x, 1.-v_uv.y)*u_res;
  vec2 uv = v_uv;
  vec2 cellId = vec2(0.);
  vec3 src;
  if(u_px>0.){
    // Chunky pixels anchored to the map, so they travel with it instead of swimming.
    vec2 anchored = u_cam.xy*u_cam.z+(css-.5*u_res);
    cellId = floor(anchored/u_px);
    css = (cellId+.5)*u_px-u_cam.xy*u_cam.z+.5*u_res;
    uv = vec2(css.x/u_res.x, 1.-css.y/u_res.y);
    vec2 o = .25*u_px/u_res;
    src = .25*(texture2D(u_tex, uv+vec2(o.x,o.y)).rgb+texture2D(u_tex, uv+vec2(-o.x,o.y)).rgb+texture2D(u_tex, uv+vec2(o.x,-o.y)).rgb+texture2D(u_tex, uv-vec2(o.x,o.y)).rgb);
  } else src = texture2D(u_tex, uv).rgb;
  vec2 world = u_cam.xy+(css-.5*u_res)/u_cam.z;
  vec3 c = src;
  float lum = dot(c, vec3(.299,.587,.114));
  float mx = max(c.r,max(c.g,c.b)), mn = min(c.r,min(c.g,c.b)), sat = mx-mn;

  // --- colour classification of the baked art ---
  float veg = smoothstep(.04,.075, c.g-max(c.r,c.b));
  float tree = veg*smoothstep(.50,.44, lum);
  float grass = veg-tree;
  float water = (1.-veg)*smoothstep(.12,.16, min(c.g,c.b)-c.r)*smoothstep(.62,.5,lum);
  float warm = (1.-veg)*smoothstep(.06,.12, c.r-c.b)*smoothstep(.88,.80,lum);
  float dark = smoothstep(.30,.17, lum)*(1.-veg);
  float road = (1.-veg)*(1.-water)*smoothstep(.13,.07,sat)*smoothstep(.3,.36,lum)*smoothstep(.56,.48,lum);
  float built = (1.-veg)*(1.-water);

  float detail = clamp(u_cam.z*1.6,0.,1.);       // fine speckle fades when zoomed out
  float clump = vnoise(world/26.);
  float speck = hash(floor(world/2.2));

  // --- seasons ---
  float au = u_season.y;
  if(au>.001){
    vec3 leaf = mix(vec3(.80,.63,.23), vec3(.74,.42,.17), smoothstep(.3,.68,clump));
    leaf = mix(leaf, vec3(.60,.25,.17), smoothstep(.72,.9,clump));
    leaf *= .5+1.15*lum;
    // some trees turn late and stay green
    float turned = smoothstep(.22,.42, vnoise(world/70.+31.));
    c = mix(c, leaf, au*tree*(.25+.65*turned));
    c = mix(c, c*vec3(1.07,1.0,.82), au*grass*.6);
    // fallen leaves on the grass
    c = mix(c, vec3(.74,.50,.22)*(.6+.8*lum), au*grass*step(.94,speck)*detail*.7);
  }
  float sp = u_season.x;
  if(sp>.001){
    c = mix(c, c*vec3(.96,1.10,.86)+vec3(.0,.02,.0), sp*veg);
    float grove = vnoise(world/19.+5.);
    float blossom = smoothstep(.60,.70,grove);
    vec3 petal = mix(vec3(.98,.76,.84), vec3(.99,.95,.93), smoothstep(.70,.86,grove));
    c = mix(c, petal*(.50+.95*lum)*(.94+.12*speck), sp*tree*blossom*.8);
  }
  float bare = u_season.z;
  if(bare>.001){
    vec3 twig = vec3(.40,.37,.33)*(.55+1.1*lum);
    c = mix(c, twig, bare*tree*.85);
    c = mix(c, vec3(lum)*vec3(1.04,1.0,.86), bare*grass*.55);
  }

  // --- snow cover ---
  float cov = u_cover;
  if(cov>.001){
    vec3 snowc = vec3(.90,.94,.99)*(.70+.42*lum);
    float patch = smoothstep(.15,.6, cov*1.3-.35*vnoise(world/9.));
    float k = grass*.96 + tree*(.18+.72*smoothstep(.34,.45,lum)) + built*(.42-.30*road-.26*warm-.2*dark) + water*.5;
    c = mix(c, snowc, clamp(k,0.,1.)*patch);
  }

  // --- weather on the ground ---
  float daylight = 1.-u_night;
  float shadow = smoothstep(.48,.72, fbm(world/1100.+vec2(u_time*.012,u_time*.004)));
  c *= 1.-.14*shadow*u_sun*(1.-u_cloud);
  float l2 = dot(c, vec3(.299,.587,.114));
  c = mix(c, vec3(l2), .18*u_cloud+.07*u_wet);
  c *= 1.-.08*u_cloud-.09*u_wet;
  c = (c-.45)*(1.+.10*u_cloud)+.45;        // overcast stays crisp, not milky
  // wet streets: darker asphalt with a cool sheen and splash rings
  float sheen = vnoise(world/14.+vec2(0.,u_time*.25));
  c += road*u_wet*vec3(.10,.13,.17)*(.4+sheen)*(.5+.5*daylight);
  float splash = step(.9965, hash(floor(world/1.8)+floor(u_time*9.)*13.));
  c += (road+.25*built)*u_rain*splash*vec3(.22,.25,.28)*detail;

  // sun glints on water
  float glint = step(.972, hash(floor(world/1.7)+floor(u_time*5.)*7.));
  c += water*glint*u_sun*(1.-u_cloud)*(.45+.4*u_warm)*detail*(1.-cov);
  c += water*u_warm*vec3(.10,.05,.0);

  // --- time of day grade ---
  c = c*u_mul+u_add;

  // --- lights: windows follow u_lit, street lamps u_lamp, so a grey rainy
  // afternoon already has a few lit rooms and the evening glows before dark ---
  float n = u_night;
  if(u_lit>.001 || u_lamp>.001){
    float zl = max(1., exp2(floor(log2(1.4/max(u_cam.z,.02)))));
    vec2 cell = vec2(3.4,2.6)*zl;
    vec2 id = floor(world/cell);
    float h = hash(id+3.);
    float lit = step(1.-.48*u_lit, h);
    float flick = .82+.18*sin(u_time*(.6+3.*h)+h*40.);
    vec3 lamp = mix(vec3(1.,.72,.36), vec3(.82,.90,1.), step(.9,hash(id+11.)));
    float win = max(dark, warm*.62*step(.62,h)*n);
    // zoomed out, single windows vanish: sprinkle lights over whole blocks instead
    win = max(win, step(1.5,zl)*built*(1.-road)*.62*step(1.-.20*u_lit,h)*(.35+.65*n));
    c += lamp*lit*win*flick*mix(.88,1.05,n)*(zl>1.5?.75:1.);
    // sodium glow of the street network, mirrored by wet asphalt
    float lampSpot = smoothstep(.62,.92, vnoise(world/6.5));
    c += road*u_lamp*vec3(.36,.27,.14)*(.20+.22*lampSpot)*(1.+.35*u_wet);
    // floodlit pale landmarks keep their face
    c += src*n*.22*smoothstep(.80,.92,lum)*built;
    // moonlit water
    c += water*n*vec3(.02,.05,.10);
  }
  // warm low sun washing in from the upper-left corner
  vec2 q = css/u_res;
  float beam = smoothstep(1.25,.0, length(q-vec2(.08,.0)));
  c += u_warm*vec3(.17,.09,.02)*beam*beam;

  // --- mist ---
  if(u_fog>.001){
    float f = u_fog*(.55+.6*fbm(world/420.+vec2(u_time*.02,0.)));
    vec3 fogc = mix(vec3(.80,.84,.88), vec3(.16,.20,.30), n)*(u_mul*.5+.5);
    c = mix(c, fogc, clamp(f,0.,.82));
  }

  // --- falling rain ---
  if(u_rain>.001){
    vec2 r = css/u_res.y;
    float streaks = 0.;
    for(int i=0;i<3;i++){
      float fi = float(i);
      float sc = 46.+34.*fi;
      vec2 p = vec2((r.x+r.y*.16)*sc, r.y*(1.6+.5*fi));
      float col = floor(p.x);
      float y = fract(p.y - u_time*(1.9+.55*fi) + hash(vec2(col,fi*9.)));
      float thin = smoothstep(.16,.02, abs(fract(p.x)-.5));
      float len = smoothstep(.0,.03,y)*smoothstep(.20,.05,y);
      streaks += thin*len*step(.35,hash(vec2(col,fi+2.)))*(.9-.22*fi);
    }
    c += vec3(.62,.70,.80)*streaks*.26*u_rain*(.45+.55*daylight);
  }

  // --- falling snow ---
  if(u_snow>.001){
    vec2 r = css/u_res.y;
    float flakes = 0.;
    for(int i=0;i<4;i++){
      float fi = float(i);
      float sc = 9.+7.*fi;
      vec2 g = r*sc + vec2(.35*sin(u_time*.35+fi*1.7)+u_time*.05*(fi-1.5), -u_time*(.34+.13*fi)*sc*.14);
      vec2 cid = floor(g);
      vec2 f = fract(g);
      vec2 o = .5+.36*vec2(hash(cid+fi*5.)-.5, hash(cid+fi*5.+3.)-.5)*2.;
      float rad = (.085-.012*fi)*(.7+.6*hash(cid+9.));
      float d = length(f-o);
      flakes += smoothstep(rad, rad*.35, d)*step(.45-.3*u_snow, hash(cid+fi*2.+1.))*(1.-.14*fi);
    }
    c = mix(c, vec3(.97,.98,1.)*(.55+.45*daylight+.25*n), clamp(flakes,0.,1.)*u_snow*.92);
  }

  c += u_flash*vec3(.55,.6,.72);
  // soft frame
  float vig = smoothstep(.95,.35, length((q-.5)*vec2(1.,.9)));
  c *= mix(1., .80+.20*vig, .15+.85*n);
  c = clamp(c,0.,1.);
  if(u_px>0.){
    // limited palette with ordered dithering, applied after all lighting
    float d = bayer4(cellId)-.47;
    c = floor(c*u_levels+.5+d*.42)/u_levels;
  }
  gl_FragColor = vec4(clamp(c,0.,1.),1.);
}`;

const UNIFORMS = ['u_tex','u_res','u_cam','u_time','u_mul','u_add','u_night','u_lit','u_lamp','u_sun','u_warm','u_season','u_cover','u_rain','u_snow','u_cloud','u_wet','u_fog','u_flash','u_px','u_levels'];

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader');
  return shader;
}

export function createFx(source, target) {
  const options = {alpha:false, antialias:false, depth:false, stencil:false, powerPreference:'high-performance', preserveDrawingBuffer:false};
  let gl = null;
  try { gl = target.getContext('webgl', options) || target.getContext('experimental-webgl', options); } catch { gl = null; }
  if (!gl) return null;
  const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!precision || precision.precision < 23) return null;

  let program, locations, texture, lost = false, textureWidth = 0, textureHeight = 0;
  function setup() {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link');
    gl.useProgram(program);
    locations = Object.fromEntries(UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)]));
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(locations.u_tex, 0);
    textureWidth = textureHeight = 0;
  }
  try { setup(); } catch (error) { console.warn('Atmosphere disabled:', error.message); return null; }

  const api = {
    canvas: target,
    get lost() { return lost; },
    onrestore: null,
    // Upload the freshly painted map. Call only when the 2D canvas changed.
    upload() {
      if (lost || !source.width || !source.height) return;
      if (target.width !== source.width || target.height !== source.height) { target.width = source.width; target.height = source.height; }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (textureWidth === source.width && textureHeight === source.height) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, source);
      else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source); textureWidth = source.width; textureHeight = source.height; }
    },
    get hasFrame() { return textureWidth > 0; },
    render(look, camera, width, height, seconds, pixel = 0, levels = 6) {
      if (lost || !textureWidth) return false;
      gl.viewport(0, 0, target.width, target.height);
      gl.uniform2f(locations.u_res, width, height);
      gl.uniform3f(locations.u_cam, camera.x, camera.y, camera.z);
      gl.uniform1f(locations.u_time, seconds % 3600);
      gl.uniform3fv(locations.u_mul, look.mul);
      gl.uniform3fv(locations.u_add, look.add);
      gl.uniform1f(locations.u_night, look.night);
      gl.uniform1f(locations.u_lit, look.lit);
      gl.uniform1f(locations.u_lamp, look.lamp);
      gl.uniform1f(locations.u_sun, look.sun);
      gl.uniform1f(locations.u_warm, look.warm);
      gl.uniform3f(locations.u_season, look.spring, look.autumn, look.bare);
      gl.uniform1f(locations.u_cover, look.cover);
      gl.uniform1f(locations.u_rain, look.rain);
      gl.uniform1f(locations.u_snow, look.snow);
      gl.uniform1f(locations.u_cloud, look.cloud);
      gl.uniform1f(locations.u_wet, look.wet);
      gl.uniform1f(locations.u_fog, look.fog);
      gl.uniform1f(locations.u_flash, look.flash || 0);
      gl.uniform1f(locations.u_px, pixel);
      gl.uniform1f(locations.u_levels, levels);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },
  };
  target.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; target.hidden = true; });
  target.addEventListener('webglcontextrestored', () => {
    try { setup(); lost = false; target.hidden = false; api.onrestore?.(); } catch { lost = true; }
  });
  return api;
}
