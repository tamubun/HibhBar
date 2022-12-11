'use strict';
import * as THREE from './js/three/build/three.module.js';

let debug = false;
let scene = null;
let physicsWorld = null;
let rigidBodies = null;

const rad_per_deg = Math.PI/180; // これは一々exportしない。

function to_rads(degrees) {
  return degrees.map(function(d) { return d * rad_per_deg; });
}

/* Ammo.btMatrix3x3 m をデバッグ用に表示する。 */
function showMat(m) {
  let s = [];
  for ( let i = 0; i < 3; ++i ) {
    let r = m.getRow(i);
    s.push(`[${[r.x(), r.y(), r.z()]}]`);
  }
  console.log(`[${s.join(',\n')}]`)
}

/* デバッグ出力用クラス */
const DebugLog = {
  count: 0,
  freq: 0,

  reset: function() {},
  changeFreq: function() {},
  countUp: function() {},
  check_d: function() {},

  reset_d: function() {
    this.count = this.freq = 0;
  },

  changeFreq_d: function() {
    if ( this.freq == 0 )
      this.freq = 20;
    else
      this.freq >>= 1;
    console.log('DebugLog: ' + this.freq );
  },

  countUp_d: function() {
    this.count += 1;
    if ( this.count >= this.freq )
      this.count = 0;
  },

  check_d: function() {
    return this.count == this.freq - 1;
  }
};

function setGlobals(s, w, r, d) {
  scene = s;
  physicsWorld = w;
  rigidBodies = r;

  debug = d;
  if ( debug ) {
    DebugLog.reset = DebugLog.reset_d;
    DebugLog.changeFreq = DebugLog.changeFreq_d;
    DebugLog.countUp = DebugLog.countUp_d;
    DebugLog.check = DebugLog.check_d;
  }
}

function makeConvexShape(geom) {
  let shape = new Ammo.btConvexHullShape();
  let index = geom.getIndex();
  let pts = geom.getAttribute('position');
  for ( let i = 0; i < index.count; ++i )
    shape.addPoint(new Ammo.btVector3(pts.getX(i), pts.getY(i), pts.getZ(i)));

  return shape;
}

function createEllipsoid(rx, ry, rz, mass, color, px, py, pz, parent, texture)
{
  let geom = new THREE.SphereBufferGeometry(1, 8, 8).scale(rx, ry, rz);
  let attr = texture ?
      {color: color, transparent: true, map: texture}: {color: color};
  let object = new THREE.Mesh(geom, new THREE.MeshPhongMaterial(attr));
  let shape = makeConvexShape(geom);
  if ( texture ) {
    object.add(new THREE.Mesh(
      geom.clone().scale(0.99, 0.99, 0.99),
      new THREE.MeshPhongMaterial({color: color})));
  }
  if ( parent ) {
    let center = parent.three.position;
    px += center.x; py += center.y; pz += center.z;
  }
  object.position.set(px, py, pz);
  return createRigidBody(object, shape, mass);
}

function createCylinder(r, len, mass, color, px, py, pz, parent)
{
  let geom = new THREE.CylinderBufferGeometry(r, r, len, 10, 1);
  let object = new THREE.Mesh(
    geom, new THREE.MeshPhongMaterial({color: color}));
  let shape = new Ammo.btCylinderShape(new Ammo.btVector3(r, len/2, r));
  if ( parent ) {
    let center = parent.three.position;
    px += center.x; py += center.y; pz += center.z;
  }
  object.position.set(px, py, pz);
  return createRigidBody(object, shape, mass);
}

function createBox(r1, r2, r3, mass, color, px, py, pz, parent)
{
  let geom = new THREE.BoxBufferGeometry(r1*2, r2*2, r3*2, 1, 1, 1);
  let object = new THREE.Mesh(
    geom, new THREE.MeshPhongMaterial({color: color}));
  let shape = new Ammo.btBoxShape(new Ammo.btVector3(r1, r2, r3));
  if ( parent ) {
    let center = parent.three.position;
    px += center.x; py += center.y; pz += center.z;
  }
  object.position.set(px, py, pz);
  return createRigidBody(object, shape, mass);
}

function createRigidBody(object, physicsShape, mass, pos, quat, vel, angVel) {
  if ( pos ) {
    object.position.copy(pos);
  } else {
    pos = object.position;
  }

  if ( quat ) {
    object.quaternion.copy(quat);
  } else {
    quat = object.quaternion;
  }

  let transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
  transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
  let motionState = new Ammo.btDefaultMotionState(transform);

  let localInertia = new Ammo.btVector3(0, 0, 0);
  physicsShape.calculateLocalInertia(mass, localInertia);

  let rbInfo = new Ammo.btRigidBodyConstructionInfo(
    mass, motionState, physicsShape, localInertia);
  let body = new Ammo.btRigidBody(rbInfo);
  body.mass = mass; // 行儀悪いけど気にしない。

  body.setFriction(0.5);

  if ( vel ) {
    body.setLinearVelocity(new Ammo.btVector3(...vel));
  }

  if ( angVel ) {
    body.setAngularVelocity(new Ammo.btVector3(...angVel));
  }

  object.userData.physicsBody = body;
  object.userData.collided = false;
  body.three = object;
  body.initial = transform;

  scene.add(object);

  if ( mass > 0 ) {
    rigidBodies.push(body);
    body.initial_transform = transform;

    // Disable deactivation
    body.setActivationState(4);
    object.initial_transform = transform;
  }

  physicsWorld.addRigidBody(body);

  return body;
}

/* limit: [liner_lower, linear_upper, angular_lower, angular_upper]
   angular_{lower/upper} limit = x, z: -180 .. 180, y: -90 .. 90

   mirror != null の時は、angular_limitに対して、左右反転する。
   (linear_limitに対しても反転しないといかんかも知れないが、
    今は使ってない(常に[0,0,0])ので気にしてない。)

   last_arg = null の時は、従来の btGeneric6DofConstraintを作り、
   それ以外の時は、last_argの Euler角順序を使った btGeneric6DofSpring2Constraint
   を作る。

   - free means upper < lower
   - locked means upper == lower
   - limited means upper > lower

   角度の回転方向が -x, -y, -z 軸方向に対しているように思われる。
   これは、btGeneric6DofConstraint, btGeneric6DofSpring2Constraint 共通。
   ↑
   この理由分った。objA, objBを繋いだモーターに対する、Aから見た回転は、
   Bを回転させるのではなく、Aを回転させると考えているのだと思う。

   btGeneric6DofSpring2Constraint では、last_argで指定する Euler角順序の
   真ん中の軸(例えば、last_arg = Ammo.RO_YZX なら Z軸)の範囲が ±90°、
   それ以外の軸の範囲が ±180°に決められている。これでは困るので、
   自力でZ軸の範囲も±180°に出来るようにした(control6DofShoulderMotors())。

   btGeneric6DofConstraintの場合は、
   モーターで指定する角度は、zyxのEuler角以外は使えない。
   つまり、最初に z軸(体の正面軸)で回し、次にy軸(捻りの軸)で回し、
   最後に x軸(宙返りの軸)で回す。但し、最初に z軸で回してしまうと、
   x軸, y軸も向きが変ってしまうので、中々思った角度に調整出来なくなる。
   姿勢によっては不可能になるが、z軸回りの回転は lockしてしまった方が
   分かり易い */
function create6Dof(
  objA, posA, eulerA = null, objB, posB, eulerB = null, limit, mirror = null,
  last_arg = null)
{
  let transform1 = new Ammo.btTransform(),
      transform2 = new Ammo.btTransform();
  if ( !eulerA ) eulerA = [0, 0, 0];
  if ( !eulerB ) eulerB = [0, 0, 0];
  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(...eulerA);
  transform1.setOrigin(new Ammo.btVector3(...posA));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(...eulerB);
  transform2.setOrigin(new Ammo.btVector3(...posB));
  let joint, constr;
  if ( last_arg !== null ) {
    constr = Ammo.btGeneric6DofSpring2Constraint;
  } else {
    constr = Ammo.btGeneric6DofConstraint;
    last_arg = true;
  }
  if ( objB !== null )
    joint = new constr(objA, objB, transform1, transform2, last_arg);
  else
    joint = new constr(objA, transform1, last_arg);
  joint.setLinearLowerLimit(new Ammo.btVector3(...limit[0]));
  joint.setLinearUpperLimit(new Ammo.btVector3(...limit[1]));
  if ( mirror != null ) {
    let tmp = [...limit[3]];
    limit[3][1] = -limit[2][1];
    limit[3][2] = -limit[2][2];
    limit[2][1] = -tmp[1];
    limit[2][2] = -tmp[2];
  }
  joint.setAngularLowerLimit(new Ammo.btVector3(...to_rads(limit[2])));
  joint.setAngularUpperLimit(new Ammo.btVector3(...to_rads(limit[3])));

  physicsWorld.addConstraint(joint, true);
  return joint;
}

function createConeTwist(
  objA, posA, eulerA = null, objB, posB, eulerB = null, limit = null)
{
  /* ConeTwistConstraint.setLimit(3,θx), setLimit(4,θy), setLimit(5,θz)

     θx, θy, θz: radianでなくdegreeで指定。

     constr.local な座標系の 原点からx軸方向、-x軸方向に向いた Cone
     (Coneの広がりは、y軸回りに±θy, z軸回りに±θz)、
     の内側にスイング動作を制限する。
     ツイストの自由度は、x軸回りに±θx (確認してないので、もしかすると
     [0..+θx]かも知れないが、きっと違う)

     setLimit(3,θx)を省くと、どうも上手く機能しない。
  */
  let transform1 = new Ammo.btTransform(),
      transform2 = new Ammo.btTransform();
  if ( !eulerA ) eulerA = [0, 0, Math.PI/2];
  if ( !eulerB ) eulerB = [0, 0, Math.PI/2];
  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(...eulerA);
  transform1.setOrigin(new Ammo.btVector3(...posA));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(...eulerB);
  transform2.setOrigin(new Ammo.btVector3(...posB));
  let joint = new Ammo.btConeTwistConstraint(
    objA, objB, transform1, transform2);
  if ( limit ) {
    limit = to_rads(limit);
    // 3: twist x-axis, 4: swing y-axis, 5: swing z-axis: constraint local
    joint.setLimit(3, limit[0]);
    joint.setLimit(4, limit[1]);
    joint.setLimit(5, limit[2]);
  }

  physicsWorld.addConstraint(joint, true);
  return joint;
}

function createHinge(
  objA, pivotA, axisA = null, objB, pivotB, axisB = null, limit = null)
{
  const x_axis = new Ammo.btVector3(1, 0, 0);
  if ( !axisA ) axisA = x_axis;
  if ( !axisB ) axisB = x_axis;
  let joint = new Ammo.btHingeConstraint(
    objA, objB,
    new Ammo.btVector3(...pivotA), new Ammo.btVector3(...pivotB),
    axisA, axisB, true);
  if ( limit )
    joint.setLimit(...to_rads([-limit[1], -limit[0]]), 0.9, 0.3, 1);

  physicsWorld.addConstraint(joint, true);
  return joint;
}

export {
  showMat, setGlobals, to_rads, DebugLog,
  createEllipsoid, createCylinder, createBox, createRigidBody,
  create6Dof, createConeTwist, createHinge
};
