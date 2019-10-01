'use strict';
import * as THREE from './js/three/build/three.module.js';
import { TrackballControls } from
  './js/three/examples/jsm/controls/TrackballControls.js';

var camera, scene, renderer, control;
var physicsWorld;
var clock = new THREE.Clock();

var transformAux1;
var rigidBodies = [];
var ammo2Three = new Map();

var bar;

var pelvis, spine, chest, head,
	left_upper_leg, left_lower_leg, right_upper_leg, right_lower_leg,
	left_upper_arm, left_lower_arm, right_upper_arm, right_lower_arm;

var joint_pelvis_spine, joint_spine_chest, joint_chest_head,
	joint_left_hip, joint_left_knee, joint_left_shoulder, joint_left_elbow,
	joint_right_hip, joint_right_knee, joint_right_shoulder, joint_right_elbow,
	helper_motor;

var joint_left_grip, joint_right_grip;

/* 全体重。各パーツの重さの違いが大きいと、なぜか手とバーとの接合部が
   引っ張られすぎてしまうので、実際の体重比
   (http://www.tukasa55.com/staff-blog/?p=5666等)からずらさないといかん */
var total_weight = 68.0;
var y_offset = -1.2;

function init() {
  initInput();
  initGraphics();
  initPhysics();
  createObjects();
}

function initInput() {
  window.addEventListener('keyup', function (event) {
	switch ( event.keyCode ) {
	case 65: // A
	  break;
	case 66: // B
	  break;
	}
  }, false);
}

function initGraphics() {
  var container = document.getElementById('container');
  camera = new THREE.PerspectiveCamera(
	60, window.innerWidth / window.innerHeight, 0.2, 2000);
  camera.position.set(7, 0, 3);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd1e5);
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x707070));

  var light = new THREE.DirectionalLight(0x888888, 1);
  light.position.set(3, 8, 0);
  scene.add(light);

  control = new TrackballControls(camera, container);
  control.target.setY(-2.7);
  control.rotateSpeed = 1.0;
  control.zoomSpeed = 1.2;
  control.panSpeed = 0.8;
  control.noZoom = false;
  control.noPan = false;
  control.staticMoving = true;
  control.dynamicDampingFactor = 0.3;
  // カメラの位置を変えても controlが上書きするので、こちらを変える。
  // 行儀良くないかも。
  control.target.set(0, -1., 0);
  control.enabled = true;

  window.addEventListener('resize', onWindowResize, false);
}

function initPhysics() {
  var collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  var dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  var broadphase = new Ammo.btDbvtBroadphase();
  var solver = new Ammo.btSequentialImpulseConstraintSolver();
  physicsWorld = new Ammo.btDiscreteDynamicsWorld(
	dispatcher, broadphase, solver, collisionConfiguration);
  physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
  transformAux1 = new Ammo.btTransform();
}

function createObjects() {
  var bar_r = 0.024, bar_h = 2.4, bar_m = 10;
  var object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(bar_r, bar_r, bar_h, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff}));
  var shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(bar_r, bar_h/2, bar_r));
  var quat = new THREE.Quaternion();
  quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI/2);
  bar = createRigidBody(object, shape, 0, null, quat); // 当面、バーの重さ 0

  var pelvis_r1 = 0.16, pelvis_r2 = 0.10, pelvis_h = 0.20, pelvis_m = 0.14;
  pelvis = createEllipsoid(
	pelvis_r1, pelvis_h/2, pelvis_r2, pelvis_m, 0x0000ff, 0, 0, 0);

  var spine_r1 = 0.14, spine_r2 = 0.09, spine_h = 0.20, spine_m = 0.13;
  spine = createEllipsoid(
	spine_r1, spine_h/2, spine_r2, spine_m, 0xffffff,
	0, (pelvis_h + spine_h)/2, 0);

  var chest_r1 = 0.1505, chest_r2 = 0.105, chest_h = 0.20, chest_m = 0.17;
  chest = createEllipsoid(
	chest_r1, chest_h/2, chest_r2, chest_m, 0xffffff,
	0, (pelvis_h + chest_h)/2 + spine_h, 0);

  var head_r1 = 0.09, head_r2 = 0.11, head_h = 0.28, head_m = 0.08;
  var texture = THREE.ImageUtils.loadTexture('face.png');
  texture.offset.set(-0.25, 0);
  head = createEllipsoid(
	head_r1, head_h/2, head_r2, head_m, 0x888800,
	0, (pelvis_h + head_h)/2 + spine_h + chest_h, 0, texture);

  var upper_leg_r = 0.08, upper_leg_h = 0.50, upper_leg_x = 0.08,
	  upper_leg_m = 0.07;
  left_upper_leg = createCylinder(
	upper_leg_r, upper_leg_h, upper_leg_m, 0x888800,
	-upper_leg_x, -(pelvis_h + upper_leg_h)/2, 0);
  right_upper_leg = createCylinder(
	upper_leg_r, upper_leg_h, upper_leg_m, 0x888800,
	upper_leg_x, -(pelvis_h + upper_leg_h)/2, 0);

  var lower_leg_r = 0.05, lower_leg_h = 0.60, lower_leg_x = 0.065,
	  lower_leg_m = 0.07;
  left_lower_leg = createCylinder(
	lower_leg_r, lower_leg_h, lower_leg_m, 0x888800,
	-lower_leg_x, -upper_leg_h - (pelvis_h + lower_leg_h)/2, 0);
  right_lower_leg = createCylinder(
	lower_leg_r, lower_leg_h, lower_leg_m, 0x888800,
	lower_leg_x, -upper_leg_h - (pelvis_h + lower_leg_h)/2, 0);

  var upper_arm_r = 0.045, upper_arm_h = 0.30, upper_arm_m = 0.05;
  left_upper_arm = createCylinder(
	upper_arm_r, upper_arm_h, upper_arm_m, 0x888800,
	-chest_r1 - upper_arm_r,
	pelvis_h/2 + spine_h + chest_h + upper_arm_h/2, 0);
  right_upper_arm = createCylinder(
	upper_arm_r, upper_arm_h, upper_arm_m, 0x888800,
	chest_r1 + upper_arm_r,
	pelvis_h/2 + spine_h + chest_h + upper_arm_h/2, 0);

  var lower_arm_r = 0.03, lower_arm_h = 0.40, lower_arm_m = 0.05;
  left_lower_arm = createCylinder(
	lower_arm_r, lower_arm_h, lower_arm_m, 0x888800,
	-chest_r1 - upper_arm_r,
	pelvis_h/2 + spine_h + chest_h + upper_arm_h + lower_arm_h/2, 0);
  right_lower_arm = createCylinder(
	lower_arm_r, lower_arm_h, lower_arm_m, 0x888800,
	chest_r1 + upper_arm_r,
	pelvis_h/2 + spine_h + chest_h + upper_arm_h + lower_arm_h/2, 0);

  joint_pelvis_spine = createConeTwist(
	pelvis, [0, pelvis_h/2, 0], null,
	spine, [0, -spine_h/2, 0], null,
	[Math.PI/4, Math.PI/4, Math.PI/4]);

  joint_spine_chest = createConeTwist(
	spine, [0, spine_h/2, 0], null,
	chest, [0, -chest_h/2, 0], null,
	[Math.PI/4, Math.PI/4, Math.PI/4]);

  joint_chest_head = createConeTwist(
	chest, [0, chest_h/2, 0], null,
	head, [0, -head_h/2, 0], null,
	[Math.PI/2, Math.PI/3, Math.PI/3]);

  // HingeConstraintを繋ぐ順番によって左右不均等になってしまう。
  // どうやって修正していいか分からないが、誰でも利き腕はあるので、
  // 当面気にしない。
  joint_left_hip = createHinge(
	pelvis, [-upper_leg_x, -pelvis_h/2, 0], null,
	left_upper_leg, [0, upper_leg_h/2, 0], null);

  joint_left_knee = createHinge(
	left_upper_leg, [upper_leg_x - lower_leg_x, -upper_leg_h/2, 0], null,
	left_lower_leg, [0, lower_leg_h/2, 0], null,
	[-Math.PI/180*170, Math.PI/180*4]);

  joint_left_shoulder = createHinge(
	chest, [-chest_r1, chest_h/2, 0], null,
	left_upper_arm, [upper_arm_r, -upper_arm_h/2, 0], null);

  joint_left_elbow = createHinge(
	left_upper_arm, [0, upper_arm_h/2, 0], null,
	left_lower_arm, [0, -lower_arm_h/2, 0], null,
	[-Math.PI/180*170, Math.PI/180*2]);

  joint_right_hip = createHinge(
	pelvis, [upper_leg_x, -pelvis_h/2, 0], null,
	right_upper_leg, [0, upper_leg_h/2, 0], null);

  joint_right_knee = createHinge(
	right_upper_leg, [-upper_leg_x + lower_leg_x, -upper_leg_h/2, 0], null,
	right_lower_leg, [0, lower_leg_h/2, 0], null,
	[-Math.PI/180*170, Math.PI/180*4]);

  joint_right_shoulder = createHinge(
	chest, [chest_r1, chest_h/2, 0], null,
	right_upper_arm, [-upper_arm_r, -upper_arm_h/2, 0], null);

  joint_right_elbow = createHinge(
	right_upper_arm, [0, upper_arm_h/2, 0], null,
	right_lower_arm, [0, -lower_arm_h/2, 0], null,
	[-Math.PI/180*170, Math.PI/180*2]);

  var axis = new Ammo.btVector3(0, -1, 0); // bar local
  joint_left_grip = createHinge(
	bar, [0, chest_r1 + upper_arm_r, 0], axis,
	left_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null);

  joint_right_grip = createHinge(
	bar, [0, -chest_r1 - upper_arm_r, 0], axis,
	right_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null);
}

function createEllipsoid(
  rx, ry, rz, mass_ratio, color, px, py, pz, texture)
{
  var geom = new THREE.SphereBufferGeometry(1, 8, 8).scale(rx, ry, rz);
  var attr = texture ?
	  {color: color, transparent: true, map: texture}: {color: color};
  var object = new THREE.Mesh(geom, new THREE.MeshPhongMaterial(attr));
  var shape = makeConvexShape(geom);
  if ( texture ) {
	object.add(new THREE.Mesh(
	  geom.clone().scale(0.99, 0.99, 0.99),
	  new THREE.MeshPhongMaterial({color: color})));
  }
  object.position.set(px, py + y_offset, pz);
  return createRigidBody(object, shape, total_weight * mass_ratio);
}

function createCylinder(r, len, mass_ratio, color, px, py, pz)
{
  var geom = new THREE.CylinderBufferGeometry(r, r, len, 10, 1);
  var object = new THREE.Mesh(
	geom, new THREE.MeshPhongMaterial({color: color}));
  var shape = new Ammo.btCylinderShape(new Ammo.btVector3(r, len/2, r));
  object.position.set(px, py + y_offset, pz);
  return createRigidBody(object, shape, total_weight * mass_ratio);
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

  var transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
  transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
  var motionState = new Ammo.btDefaultMotionState(transform);

  var localInertia = new Ammo.btVector3(0, 0, 0);
  physicsShape.calculateLocalInertia(mass, localInertia);

  var rbInfo = new Ammo.btRigidBodyConstructionInfo(
	mass, motionState, physicsShape, localInertia);
  var body = new Ammo.btRigidBody(rbInfo);

  body.setFriction(0.5);

  if ( vel ) {
	body.setLinearVelocity(new Ammo.btVector3(...vel));
  }

  if ( angVel ) {
	body.setAngularVelocity(new Ammo.btVector3(...angVel));
  }

  object.userData.physicsBody = body;
  object.userData.collided = false;
  ammo2Three.set(body, object);

  scene.add(object);

  if (mass > 0) {
	rigidBodies.push(object);

	// Disable deactivation
	body.setActivationState(4);
  }

  physicsWorld.addRigidBody(body);

  return body;
}

function createConeTwist(
  objA, posA, eulerA = null, objB, posB, eulerB = null, limit = null)
{
  /* ConeTwistConstraint.setLimit(3,θx), setLimit(4,θy), setLimit(5,θz)

	 constr.local な座標系の 原点からx軸方向、-x軸方向に向いた Cone
	 (Coneの広がりは、y軸回りに±θy, z軸回りに±θz)、
	 の内側にスイング動作を制限する。
	 ツイストの自由度は、x軸回りに±θx (確認してないので、もしかすると
	 [0..+θx]かも知れないが、きっと違う)

	 setLimit(3,θx)を省くと、どうも上手く機能しない。
  */
  var transform1 = new Ammo.btTransform(),
	  transform2 = new Ammo.btTransform();
  if ( !eulerA ) eulerA = [0, 0, Math.PI/2];
  if ( !eulerB ) eulerB = [0, 0, Math.PI/2];
  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(...eulerA);
  transform1.setOrigin(new Ammo.btVector3(...posA));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(...eulerB);
  transform2.setOrigin(new Ammo.btVector3(...posB));
  var joint = new Ammo.btConeTwistConstraint(
	objA, objB, transform1, transform2);
  if ( limit ) {
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
  var joint = new Ammo.btHingeConstraint(
	objA, objB,
	new Ammo.btVector3(...pivotA), new Ammo.btVector3(...pivotB),
	axisA, axisB, true);
  if ( limit )
	joint.setLimit(limit[0], limit[1], 0.9, 0.3, 1);

  physicsWorld.addConstraint(joint, true);
  return joint;
}

function makeConvexShape(geom) {
  var shape = new Ammo.btConvexHullShape();
  var index = geom.getIndex();
  var pts = geom.getAttribute('position');
  for ( var i = 0; i < index.count; ++i )
	shape.addPoint(new Ammo.btVector3(pts.getX(i), pts.getY(i), pts.getZ(i)));

  return shape;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  render();
}

function render() {
  var deltaTime = clock.getDelta();

  updatePhysics(deltaTime);
  control.update();
  renderer.render(scene, camera);
}

function updatePhysics(deltaTime) {
  joint_left_hip.setMotorTarget(0, 0.1);
  joint_left_knee.setMotorTarget(0, 0.1);
  joint_left_shoulder.setMotorTarget(0, 0.1);
  joint_left_elbow.setMotorTarget(0, 0.1);
  joint_right_hip.setMotorTarget(0, 0.1);
  joint_right_knee.setMotorTarget(0, 0.1);
  joint_right_shoulder.setMotorTarget(0, 0.1);
  joint_right_elbow.setMotorTarget(0, 0.1);

  physicsWorld.stepSimulation(deltaTime, 10);

  // Update rigid bodies
  for ( var i = 0, il = rigidBodies.length; i < il; i ++ ) {
	var objThree = rigidBodies[i];
	var objPhys = objThree.userData.physicsBody;
	var ms = objPhys.getMotionState();

	if ( ms ) {
	  ms.getWorldTransform(transformAux1);
	  var p = transformAux1.getOrigin();
	  var q = transformAux1.getRotation();
	  objThree.position.set(p.x(), p.y(), p.z());
	  objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());

	  objThree.userData.collided = false;
	}
  }
}

function startSwing() {
  joint_left_hip.enableAngularMotor(true, 0, 2);
  joint_left_knee.enableAngularMotor(true, 0, 2);
  joint_left_shoulder.enableAngularMotor(true, 0, 2);
  joint_left_elbow.enableAngularMotor(true, 0, 2);
  joint_right_hip.enableAngularMotor(true, 0, 2);
  joint_right_knee.enableAngularMotor(true, 0, 2);
  joint_right_shoulder.enableAngularMotor(true, 0, 2);
  joint_right_elbow.enableAngularMotor(true, 0, 2);

  var q = new Ammo.btQuaternion();
  q.setEulerZYX(0, 0, 0);

  joint_chest_head.setMotorTarget(q);
  joint_chest_head.setMaxMotorImpulse(2);
  joint_chest_head.enableMotor(true);
  joint_spine_chest.setMotorTarget(q);
  joint_spine_chest.setMaxMotorImpulse(2);
  joint_spine_chest.enableMotor(true);
  joint_pelvis_spine.setMotorTarget(q);
  joint_pelvis_spine.setMaxMotorImpulse(2);
  joint_pelvis_spine.enableMotor(true);

  var target_angle = Math.PI/180  * (-170); // 最初に体をこの角度まで持ち上げる
  var p = ammo2Three.get(pelvis).position;
  helper_motor = createHinge(
	bar, [0, 0, 0], new Ammo.btVector3(0, -1, 0),
	pelvis, [p.x, -p.y, p.z], null);
  helper_motor.setMaxMotorImpulse(200);
  helper_motor.enableMotor(true);
  for ( var i = 0; i < 20; ++i ) {
	helper_motor.setMotorTarget(target_angle, 1);
	physicsWorld.stepSimulation(0.2, 100, 1./120);
  }

  physicsWorld.removeConstraint(helper_motor);
}

Ammo().then(function(AmmoLib) {
  Ammo = AmmoLib;
  init();
  startSwing();
  animate();
});
