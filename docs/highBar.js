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
var hinge, hinge2;

var pelvis, spine, chest, head,
	left_upper_leg, left_lower_leg, right_upper_leg, right_lower_leg,
	left_upper_arm, left_lower_arm, right_upper_arm, right_lower_arm;

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
  var y_offset = -2;
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
  var bar = createRigidBody(object, shape, bar_mass, pos, quat);

/*
  var arm_radius = 0.04;
  var arm_length = 1.0;
  var arm_mass = 10;
  object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  arm_radius, arm_radius, arm_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(arm_radius, arm_length/2, arm_radius));
  pos.set(0, -(arm_length / 2 + bar_radius * 1.01), 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);
  var ang_vel = new THREE.Vector3(20, 0, 0);
  var arm = createRigidBody(object, shape, arm_mass, pos, quat, null, ang_vel);

  // Hinge constraint to move the arm
  var pivotA = new Ammo.btVector3(0, 0, 0);
  var pivotB = new Ammo.btVector3(0, arm_length / 2 + bar_radius * 1.01, 0);
  var axisA = new Ammo.btVector3(0, 1, 0); // bar local
  var axisB = new Ammo.btVector3(1, 0, 0);
  hinge = new Ammo.btHingeConstraint(
	bar, arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(hinge, true);

  var arm2_radius = 0.06;
  var arm2_length = 0.8;
  var arm2_mass = 10;
  object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  arm2_radius, arm2_radius, arm2_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(arm2_radius, arm2_length/2, arm2_radius));
  pos.set(0, -(arm2_length / 2 + arm_length + bar_radius * 1.01), 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);
  var ang_vel = new THREE.Vector3(10, 0, 0);
  var arm2 =
	createRigidBody(object, shape, arm2_mass, pos, quat, null, null);

  var pivotA2 = new Ammo.btVector3(0, -arm_length / 2, 0);
  var pivotB2 = new Ammo.btVector3(0, arm2_length / 2, 0);
  var axisA2 = new Ammo.btVector3(1, 0, 0);
  var axisB2 = new Ammo.btVector3(1, 0, 0);
  hinge2 = new Ammo.btHingeConstraint(
	arm, arm2, pivotA2, pivotB2, axisA2, axisB2, true);
  physicsWorld.addConstraint(hinge2, true);
*/

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
