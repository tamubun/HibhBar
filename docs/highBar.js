'use strict';
import * as THREE from './js/three/build/three.module.js';
import { TrackballControls } from
  './js/three/examples/jsm/controls/TrackballControls.js';

var camera, scene, renderer, control;
var physicsWorld;
var clock = new THREE.Clock();

var pos = new THREE.Vector3();
var vec = new THREE.Vector3();
var quat = new THREE.Quaternion();
var transformAux1;
var rigidBodies = [];

var bar;

var pelvis, spine, chest, head,
	left_upper_leg, left_lower_leg, right_upper_leg, right_lower_leg,
	left_upper_arm, left_lower_arm, right_upper_arm, right_lower_arm;

var joint_pelvis_spine, joint_spine_chest, joint_chest_head,
	joint_left_hip, joint_left_knee, joint_left_shoulder, joint_left_elbow,
	joint_right_hip, joint_right_knee, joint_right_shoulder, joint_right_elbow;

var joint_left_grip, joint_right_grip;

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
  camera.position.set(3, -0.7, 8);
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
  physicsWorld.setGravity(new Ammo.btVector3(0, 0, 0));
  transformAux1 = new Ammo.btTransform();
}

function createObjects() {
  var bar_radius = 0.024;
  var bar_length = 2.4;
  var bar_mass = 0;
  var object, shape, geom, vertices;
  var pivotA, pivotB, axisA, axisB;
  var y_offset = -1.2;
  var i;
  object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  bar_radius, bar_radius, bar_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(bar_radius, bar_length/2, bar_radius));
  pos.set(0, 0, 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, Math.PI/2);
  bar = createRigidBody(object, shape, bar_mass, pos, quat);

  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);

  var pelvis_r1 = 0.16, pelvis_r2 = 0.10, pelvis_h = 0.20;
  geom = new THREE.SphereBufferGeometry(1, 20, 20);
  object = new THREE.Mesh(
	geom.scale(pelvis_r1, pelvis_h/2, pelvis_r2),
	new THREE.MeshPhongMaterial({color: 0x0000ff})
  );
  shape = new Ammo.btConvexHullShape();
  vertices = (new THREE.Geometry())
	  .fromBufferGeometry(geom)
	  .mergeVertices()
	  .vertices;
  for ( i = 0; i < vertices; i += 3 )
	shape.addPoint(new btVector3(vertices[i], vertices[i+1], vertices[i+2]));
  pos.set(0, y_offset, 0);
  pelvis = createRigidBody(object, shape, 1, pos, quat);

  var spine_r1 = 0.14, spine_r2 = 0.09, spine_h = 0.20;
  geom = new THREE.SphereBufferGeometry(1, 20, 20);
  object = new THREE.Mesh(
	geom.scale(spine_r1, spine_h/2, spine_r2),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btConvexHullShape();
  vertices = (new THREE.Geometry())
	  .fromBufferGeometry(geom)
	  .mergeVertices()
	  .vertices;
  for ( i = 0; i < vertices; i += 3 )
	shape.addPoint(new btVector3(vertices[i], vertices[i+1], vertices[i+2]));
  pos.set(0, y_offset + (pelvis_h + spine_h)/2, 0);
  spine = createRigidBody(object, shape, 1, pos, quat);

  var chest_r1 = 0.1505, chest_r2 = 0.105, chest_h = 0.20;
  geom = new THREE.SphereBufferGeometry(1, 20, 20);
  object = new THREE.Mesh(
	geom.scale(chest_r1, chest_h/2, chest_r2),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btConvexHullShape();
  vertices = (new THREE.Geometry())
	  .fromBufferGeometry(geom)
	  .mergeVertices()
	  .vertices;
  for ( i = 0; i < vertices; i += 3 )
	shape.addPoint(new btVector3(vertices[i], vertices[i+1], vertices[i+2]));
  pos.set(0, y_offset + (pelvis_h + chest_h)/2 + spine_h, 0);
  chest = createRigidBody(object, shape, 1, pos, quat);

  var head_r1 = 0.09, head_r2 = 0.11, head_h = 0.28;
  geom = new THREE.SphereBufferGeometry(1, 20, 20);
  object = new THREE.Mesh(
	geom.scale(head_r1, head_h/2, head_r2),
	new THREE.MeshPhongMaterial({color: 0x888800})
  );
  shape = new Ammo.btConvexHullShape();
  vertices = (new THREE.Geometry())
	  .fromBufferGeometry(geom)
	  .mergeVertices()
	  .vertices;
  for ( i = 0; i < vertices; i += 3 )
	shape.addPoint(new btVector3(vertices[i], vertices[i+1], vertices[i+2]));
  pos.set(0, y_offset + (pelvis_h + head_h)/2 + spine_h + chest_h, 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);
  head = createRigidBody(object, shape, 1, pos, quat);

  var upper_leg_r = 0.08, upper_leg_h = 0.50, upper_leg_x = 0.08;

  geom = new THREE.CylinderBufferGeometry(
	upper_leg_r, upper_leg_r, upper_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_leg_r, upper_leg_h/2, upper_leg_r));
  pos.set(-upper_leg_x, y_offset - (pelvis_h + upper_leg_h)/2, 0);
  left_upper_leg = createRigidBody(object, shape, 1, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	upper_leg_r, upper_leg_r, upper_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_leg_r, upper_leg_h/2, upper_leg_r));
  pos.set(upper_leg_x, y_offset - (pelvis_h + upper_leg_h)/2, 0);
  right_upper_leg = createRigidBody(object, shape, 1, pos, quat);

  var lower_leg_r = 0.05, lower_leg_h = 0.60, lower_leg_x = 0.065;

  geom = new THREE.CylinderBufferGeometry(
	lower_leg_r, lower_leg_r, lower_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_leg_r, lower_leg_h/2, lower_leg_r));
  pos.set(-lower_leg_x, y_offset - upper_leg_h - (pelvis_h + lower_leg_h)/2, 0);
  left_lower_leg = createRigidBody(object, shape, 1, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	lower_leg_r, lower_leg_r, lower_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_leg_r, lower_leg_h/2, lower_leg_r));
  pos.set(lower_leg_x, y_offset - upper_leg_h - (pelvis_h + lower_leg_h)/2, 0);
  right_lower_leg = createRigidBody(object, shape, 1, pos, quat);

  var upper_arm_r = 0.045, upper_arm_h = 0.30;

  geom = new THREE.CylinderBufferGeometry(
	upper_arm_r, upper_arm_r, upper_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_arm_r, upper_arm_h/2, upper_arm_r));
  pos.set(-chest_r1 - upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h - upper_arm_h/2, 0);
  left_upper_arm = createRigidBody(object, shape, 1, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	upper_arm_r, upper_arm_r, upper_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_arm_r, upper_arm_h/2, upper_arm_r));
  pos.set(chest_r1 + upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h - upper_arm_h/2, 0);
  right_upper_arm = createRigidBody(object, shape, 1, pos, quat);

  var lower_arm_r = 0.03, lower_arm_h = 0.40;

  geom = new THREE.CylinderBufferGeometry(
	lower_arm_r, lower_arm_r, lower_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_arm_r, lower_arm_h/2, lower_arm_r));
  pos.set(-chest_r1 - upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h - upper_arm_h
		  - lower_arm_h/2, 0);
  left_lower_arm = createRigidBody(object, shape, 1, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	lower_arm_r, lower_arm_r, lower_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_arm_r, lower_arm_h/2, lower_arm_r));
  pos.set(chest_r1 + upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h - upper_arm_h
		  - lower_arm_h/2, 0);
  right_lower_arm = createRigidBody(object, shape, 1, pos, quat);

  pivotA = new Ammo.btVector3(0, pelvis_h/2, 0);
  pivotB = new Ammo.btVector3(0, -spine_h/2, 0);
  axisA = new Ammo.btVector3(1, 0, 0);
  axisB = new Ammo.btVector3(1, 0, 0);
  joint_pelvis_spine = new Ammo.btHingeConstraint(
	pelvis, spine, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_pelvis_spine, true);

  pivotA = new Ammo.btVector3(0, spine_h/2, 0);
  pivotB = new Ammo.btVector3(0, -chest_h/2, 0);
  joint_spine_chest = new Ammo.btHingeConstraint(
	spine, chest, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_spine_chest, true);

  pivotA = new Ammo.btVector3(0, chest_h/2, 0);
  pivotB = new Ammo.btVector3(0, -head_h/2, 0);
  joint_chest_head = new Ammo.btHingeConstraint(
	chest, head, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_chest_head, true);
  pivotA = new Ammo.btVector3(-upper_leg_x, -pelvis_h/2, 0);
  pivotB = new Ammo.btVector3(0, upper_leg_h/2, 0);
  joint_left_hip = new Ammo.btHingeConstraint(
	pelvis, left_upper_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_hip, true);

  pivotA = new Ammo.btVector3(upper_leg_x - lower_leg_x, -upper_leg_h/2, 0);
  pivotB = new Ammo.btVector3(0, lower_leg_h/2, 0);
  joint_left_knee = new Ammo.btHingeConstraint(
	left_upper_leg, left_lower_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_knee, true);

  pivotA = new Ammo.btVector3(-chest_r1, chest_h/2, 0);
  pivotB = new Ammo.btVector3(upper_arm_r, upper_arm_h/2, 0);
  joint_left_shoulder = new Ammo.btHingeConstraint(
	chest, left_upper_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_shoulder, true);

  pivotA = new Ammo.btVector3(0, -upper_arm_h/2, 0);
  pivotB = new Ammo.btVector3(0, lower_arm_h/2, 0);
  joint_left_elbow = new Ammo.btHingeConstraint(
	left_upper_arm, left_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_elbow, true);

  pivotA = new Ammo.btVector3(upper_leg_x, -pelvis_h/2, 0);
  pivotB = new Ammo.btVector3(0, upper_leg_h/2, 0);
  joint_right_hip = new Ammo.btHingeConstraint(
	pelvis, right_upper_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_hip, true);

  pivotA = new Ammo.btVector3(-upper_leg_x + lower_leg_x, -upper_leg_h/2, 0);
  pivotB = new Ammo.btVector3(0, lower_leg_h/2, 0);
  joint_right_knee = new Ammo.btHingeConstraint(
	right_upper_leg, right_lower_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_knee, true);

  pivotA = new Ammo.btVector3(chest_r1, chest_h/2, 0);
  pivotB = new Ammo.btVector3(-upper_arm_r, upper_arm_h/2, 0);
  joint_right_shoulder = new Ammo.btHingeConstraint(
	chest, right_upper_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_shoulder, true);

  pivotA = new Ammo.btVector3(0, -upper_arm_h/2, 0);
  pivotB = new Ammo.btVector3(0, lower_arm_h/2, 0);
  joint_right_elbow = new Ammo.btHingeConstraint(
	right_upper_arm, right_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_elbow, true);

  pivotA = new Ammo.btVector3(0, -chest_r1 - upper_arm_r, 0);
  pivotB = new Ammo.btVector3(0, -lower_arm_h/2 - bar_radius, 0);
  axisA = new Ammo.btVector3(0, 1, 0); // bar local
  joint_left_grip = new Ammo.btHingeConstraint(
	bar, left_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_grip, true);

  pivotA = new Ammo.btVector3(0, chest_r1 + upper_arm_r, 0);
  pivotB = new Ammo.btVector3(0, -lower_arm_h/2 - bar_radius, 0);
  axisA = new Ammo.btVector3(0, 1, 0); // bar local
  joint_right_grip = new Ammo.btHingeConstraint(
	bar, right_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_grip, true);
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
	body.setLinearVelocity(new Ammo.btVector3(vel.x, vel.y, vel.z));
  }

  if ( angVel ) {
	body.setAngularVelocity(new Ammo.btVector3(angVel.x, angVel.y, angVel.z));
  }

  object.userData.physicsBody = body;
  object.userData.collided = false;

  scene.add(object);

  if (mass > 0) {
	rigidBodies.push(object);

	// Disable deactivation
	body.setActivationState(4);
  }

  physicsWorld.addRigidBody(body);

  return body;
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

$(function() {
  Ammo().then(function(AmmoLib) {
	Ammo = AmmoLib;
	init();
	animate();
  });
});
