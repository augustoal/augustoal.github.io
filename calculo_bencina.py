import pickle


class Viaje:
    def __init__(self, nombre, kms, direccion=False):
        self.nombre = nombre
        self.kms = kms
        self.direccion = direccion


precio_km = 400/3


def abrir_archivo():
    with open("viajes.pkl", "rb") as archivo:
        lista = pickle.load(archivo)
        return lista


def guardar_archivo(lista):
    with open("viajes.pkl", "wb") as archivo:
        pickle.dump(lista, archivo)


def menu_inicial():
    opciones = {"1": menu_deuda,
                "2": menu_agregar}
    while True:
        respuesta = input("Elige que quieres hacer:\n"
                          "1. Calcular deuda\n"
                          "2. Agregar Viaje\n"
                          "3. Salir\n"
                          "R: ")
        if respuesta == "3":
            break
        elif respuesta not in opciones.keys():
            print("Esa no es una respuesta válida\n")
        else:
            opciones[respuesta]()
    print("\nAdiós")


def menu_deuda():
    lista = abrir_archivo()
    largo = len(lista)
    while True:
        for i,j in enumerate(lista):
            print("{}: {}".format(i, j.nombre))
        respuesta = input("Escribe los viajes que haz hecho separados por coma:\n").split(",")
        errores = []
        for i in respuesta:
            if not i.isdigit():
                errores.append(i)
            elif int(i) >= largo:
                errores.append(i)
        if len(errores) == 0:
            break
        else:
            print("Los siguientes valores no son válidos: {}".format(errores))
            print("Inténtalo de nuevo")
    calcular_deuda(respuesta)


def calcular_deuda(respuesta):
    lista = abrir_archivo()
    respuesta_sin_repeticion = set(respuesta)
    deuda = 0
    for i in respuesta:
        deuda += lista[int(i)].kms * precio_km
    print("Hiciste los siguientes viajes:")
    for i in respuesta_sin_repeticion:
        if respuesta.count(i) == 1:
            print("{} 1 vez".format(lista[int(i)].nombre))
        else:
            print("{} {} veces".format(lista[int(i)].nombre, respuesta.count(i)))
    print("El total que debes es de: ${}".format(deuda))
    while True:
        a = input("Volver al menu inicial\n")
        break


def menu_agregar():
    lista = abrir_archivo()
    while True:
        nombre = input("Ingresa los datos necesarios:\n"
                          "Nombre: ")
        distancia = input("Distancia (en kms): ")
        direccion = input("Direccion: ")
        if nombre == "" or distancia == "" or not distancia.replace(".", "", 1).isdigit():
            print("Ingresaste mal un dato")
        else:
            if direccion == "":
                lista.append(Viaje(nombre, float(distancia)))
            else:
                lista.append(Viaje(nombre, float(distancia), direccion))
            guardar_archivo(lista)
        resp = input("Quieres agregar otro viaje? (1. Si)\n"
                     "R: ")
        if resp != "1":
            break

if __name__ == "__main__":
    menu_inicial()





