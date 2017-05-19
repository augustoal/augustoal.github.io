import sqlite3
from barcode import lector

'''
def lector():
    return {"12345", "67890"}
'''

def agregar_bd(cursor, codigos):
    try:
        for codigo in codigos:
            cursor.execute("INSERT INTO productos values (?)", (codigo,))
        print("Codigos {} agregados exitosamente\n".format(codigos))
    except:
        print("Parece que hubo un problema, inténtalo de nuevo\n")


def ver_inventario(cursor):
    productos = cursor.execute("SELECT * FROM productos")
    print("Código:\n")
    for producto in productos:
        print(producto)


def agregar(cursor):
    while True:
        resp = input("Como quieres agregar el producto?\n"
                     "1. Manual\n"
                     "2. Automático\n"
                     "3. Salir\n")
        if resp == "1":
            codigos = {input("Ingresa el codigo: ")}
        elif resp == "2":
            codigos = lector()
        else:
            break
        agregar_bd(cursor, codigos)


def vender(cursor):
    pass


def ajustes(cursor):
    try:
        resp = input("No se puede hacer esto todavia, presiona cualquier tecla para volver\n")
    except:
        resp = 0


def menu_inicial():
    base = sqlite3.connect("inventario.db")
    cursor = base.cursor()
    menu = {"1": agregar,
            "2": ver_inventario,
            "3": vender,
            "4": ajustes}
    while True:
        pregunta = input("Qué quieres hacer?\n"
                         "1. Agregar productos al inventario\n"
                         "2. Ver tu inventario\n"
                         "3. Vender productos\n"
                         "4. Configurar cuenta\n"
                         "5. Salir\n")
        if pregunta in menu.keys():
            menu[pregunta](cursor)
        elif pregunta == "5":
            base.commit()
            base.close()
            break
        else:
            print("No entendi, probemos de nuevo")

if __name__ == "__main__":
    menu_inicial()
