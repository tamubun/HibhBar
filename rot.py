import numpy as np
from sympy import *

def deg(rad):
    return rad / np.pi * 180

def rad(deg):
    return deg / 180 * np.pi

# tamu

def rot(axis, rad):
    i, j, k = ((0, 1, 2), (1, 2, 0), (2, 0, 1))[axis]
    m = np.zeros((3,3))
    m[i, i] = 1.
    m[i, j] = 0.
    m[i, k] = 0.

    m[j, i] = 0.
    m[j, j] = np.cos(rad)
    m[j, k] = -np.sin(rad)

    m[k, i] = 0.
    m[k, j] = np.sin(rad)
    m[k, k] = np.cos(rad)

    return m

# Blender

rotOrders = (
    (0, 1, 2, 0), # XYZ
    (0, 2, 1, 1), # XZY
    (1, 0, 2, 1), # YXZ
    (1, 2, 0, 0), # YZX
    (2, 0, 1, 0), # ZXY
    (2, 1, 0, 1)) # ZYX

def eulO_to_mat3(e, order):
    """ e: (extrinsic order) -> (rot matrix の transpose) を返す。 """
    i, j, k, parity = rotOrders[order]

    if parity:
        ti = -e[i]
        tj = -e[j]
        th = -e[k]
    else:
        ti = e[i]
        tj = e[j]
        th = e[k]

    ci = np.cos(ti)
    cj = np.cos(tj)
    ch = np.cos(th)
    si = np.sin(ti)
    sj = np.sin(tj)
    sh = np.sin(th)

    cc = ci * ch
    cs = ci * sh
    sc = si * ch
    ss = si * sh

    M = np.zeros((3,3))
    M[i, i] = (cj * ch)
    M[j, i] = (sj * sc - cs)
    M[k, i] = (sj * cc + ss)

    M[i, j] = (cj * sh)
    M[j, j] = (sj * ss + cc)
    M[k, j] = (sj * cs - sc)

    M[i, k] = (-sj)
    M[j, k] = (cj * si)
    M[k, k] = (cj * ci)

    return M

def mat3_normalized_to_eulo2(mat, order):
    eul1 = np.zeros(3)
    eul2 = np.zeros(3)
    i, j, k, parity = rotOrders[order]

    cy = np.hypot(mat[i,i], mat[i,j])

    if cy > 0.0001:
        eul1[i] = np.arctan2(mat[j,k], mat[k,k])
        eul1[j] = np.arctan2(-mat[i,k], cy)
        eul1[k] = np.arctan2(mat[i,j], mat[i,i])

        eul2[i] = np.arctan2(-mat[j,k], -mat[k,k])
        eul2[j] = np.arctan2(-mat[i,k], -cy)
        eul2[k] = np.arctan2(-mat[i,j], -mat[i,i])
    else:
        eul1[i] = np.arctan2(-mat[k,j], mat[j,j])
        eul1[j] = np.arctan2(-mat[i,k], cy)
        eul1[k] = 0

        eul2 = eul1

    if parity:
        eul1 = -eul1
        eul2 = -eul2

    return (eul1, eul2)

def mat3_to_eulO(mat,  order):
    """ mat: rot matrix の transpose -> e: (extrinsic order) を返す。 """
    eul1, eul2 = mat3_normalized_to_eulo2(mat, order)

    d1 = np.abs(eul1[0]) + np.abs(eul1[1]) + np.abs(eul1[2])
    d2 = np.abs(eul2[0]) + np.abs(eul2[1]) + np.abs(eul2[2])

    return eul2 if d1 > d2 else eul1


# sympy

phi, th, psi, x, y, z = symbols('phi theta psi x y z')

def s_rot(axis, angle):
    i, j, k = ((0, 1, 2), (1, 2, 0), (2, 0, 1))[axis]
    m = eye(3)
    m[i, i] = 1
    m[i, j] = 0
    m[i, k] = 0

    m[j, i] = 0
    m[j, j] = cos(angle)
    m[j, k] = -sin(angle)

    m[k, i] = 0
    m[k, j] = sin(angle)
    m[k, k] = cos(angle)

    return m
