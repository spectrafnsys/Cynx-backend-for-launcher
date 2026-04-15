cmake_minimum_required(VERSION 3.15)
project(FortniteGameServer)

# C++17 required
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(SOURCES
    main.cpp
    GameServer.cpp
)

# Header files
set(HEADERS
    GameServer.h
    BackendAPI.h
    MemoryHooks.h
)

# Create executable
add_executable(GameServer ${SOURCES} ${HEADERS})

# Find required packages
find_package(CURL REQUIRED)
find_package(jsoncpp REQUIRED)

# Include directories
target_include_directories(GameServer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CURL_INCLUDE_DIRS}
)

# Link libraries
target_link_libraries(GameServer PRIVATE
    ${CURL_LIBRARIES}
    jsoncpp_lib
    ws2_32
)

# Windows-specific settings
if(WIN32)
    target_compile_definitions(GameServer PRIVATE
        _WIN32_WINNT=0x0601
        NOMINMAX
    )
endif()

# Output directory
set_target_properties(GameServer PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# Copy config file to output
add_custom_command(TARGET GameServer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
    ${CMAKE_SOURCE_DIR}/server_config.json
    $<TARGET_FILE_DIR:GameServer>/server_config.json
)

