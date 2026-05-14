# The following lines of boilerplate have to be in your project's CMakeLists
# in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.13)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

project(tbd-sim)

# Boost 1.90.0+ provides its own cmake config
cmake_policy(SET CMP0167 NEW)

add_definitions(
        -DRAPIDJSON_ALLOCATOR_DEFAULT_CHUNK_CAPACITY=16384 # rapidjson
        -DRAPIDJSON_HAS_STDSTRING=1 # rapidjson
        -DTBD_SIM=1
        -Wno-unused-local-typedefs
        -DMUTABLE_STD_CPP
        -DCONFIG_DSP_ANSI=1
        -DN_CVS=4
        -DN_TRIGS=2
)

set(TBD_SIM 1)

# Optimise the DSP — an unoptimised build can't keep up at 44.1 kHz / 32-sample
# blocks on a desktop and crackles. -O2 only (no -DNDEBUG, so asserts stay live).
# Set here, before the add_subdirectory(...ctagSoundProcessor...) below, so the
# DSP library inherits it too. (Override by passing -DCMAKE_BUILD_TYPE=... yourself.)
if(NOT CMAKE_BUILD_TYPE)
    add_compile_options(-O2)
endif()

## Web Server Part
add_library(simple-web-server INTERFACE)
target_include_directories(simple-web-server INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/Simple-Web-Server)
find_package(Threads REQUIRED)
target_link_libraries(simple-web-server INTERFACE ${CMAKE_THREAD_LIBS_INIT})
find_package(Boost 1.67.0 COMPONENTS thread REQUIRED)
target_link_libraries(simple-web-server INTERFACE ${Boost_LIBRARIES})
target_include_directories(simple-web-server INTERFACE ${Boost_INCLUDE_DIR})
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 4.9)
    target_compile_definitions(simple-web-server INTERFACE USE_BOOST_REGEX)
    find_package(Boost 1.67.0 COMPONENTS regex REQUIRED)
    target_link_libraries(simple-web-server INTERFACE ${Boost_LIBRARIES})
    target_include_directories(simple-web-server INTERFACE ${Boost_INCLUDE_DIR})
endif()

#rtaudio
set(RTAUDIO_BUILD_STATIC_LIBS TRUE)
# macOS arm64: a stray Intel /usr/local/lib/libjack.dylib trips RtAudio's
# auto-detect and breaks linking. Force off so the Apple-Silicon build works.
if(APPLE AND CMAKE_SYSTEM_PROCESSOR STREQUAL "arm64")
    set(RTAUDIO_API_JACK OFF CACHE BOOL "Build JACK audio server API" FORCE)
endif()
add_subdirectory(rtaudio)

#esp-dsp
set(ESP_DSP_DIR "esp-dsp")
set(ESP_DSP_SRC_FILES  "${ESP_DSP_DIR}/modules/common/misc/dsps_pwroftwo.cpp"
        "${ESP_DSP_DIR}/modules/dotprod/float/dsps_dotprod_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/dotprod/float/dsps_dotprode_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/dotprod/fixed/dsps_dotprod_s16_ansi.c"
        #"${ESP_DSP_DIR}/modules/matrix/float/dspm_mult_f32_ansi.c"
        #"${ESP_DSP_DIR}/modules/matrix/fixed/dspm_mult_s16_ansi.c"
        "${ESP_DSP_DIR}/modules/math/mulc/float/dsps_mulc_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/math/addc/float/dsps_addc_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/math/add/float/dsps_add_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/math/sub/float/dsps_sub_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/math/mul/float/dsps_mul_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/support/misc/dsps_d_gen.c"
        "${ESP_DSP_DIR}/modules/support/misc/dsps_h_gen.c"
        "${ESP_DSP_DIR}/modules/support/misc/dsps_tone_gen.c"
        "${ESP_DSP_DIR}/modules/support/view/dsps_view.cpp"
        "${ESP_DSP_DIR}/modules/windows/hann/float/dsps_wind_hann_f32.c"
        "${ESP_DSP_DIR}/modules/windows/blackman/float/dsps_wind_blackman_f32.c"
        "${ESP_DSP_DIR}/modules/windows/blackman_harris/float/dsps_wind_blackman_harris_f32.c"
        "${ESP_DSP_DIR}/modules/windows/blackman_nuttall/float/dsps_wind_blackman_nuttall_f32.c"
        "${ESP_DSP_DIR}/modules/windows/nuttall/float/dsps_wind_nuttall_f32.c"
        "${ESP_DSP_DIR}/modules/windows/flat_top/float/dsps_wind_flat_top_f32.c"
        "${ESP_DSP_DIR}/modules/conv/float/dsps_conv_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/conv/float/dsps_corr_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/conv/float/dsps_ccorr_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/iir/biquad/dsps_biquad_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/iir/biquad/dsps_biquad_gen_f32.c"
        "${ESP_DSP_DIR}/modules/fir/float/dsps_fir_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/fir/float/dsps_fir_init_f32.c"
        "${ESP_DSP_DIR}/modules/fir/float/dsps_fird_f32_ansi.c"
        "${ESP_DSP_DIR}/modules/fir/float/dsps_fird_init_f32.c")

set(ESP_DSP_INC_DIRS   "${ESP_DSP_DIR}/modules/dotprod/include"
        "${ESP_DSP_DIR}/modules/support/include"
        "${ESP_DSP_DIR}/modules/windows/include"
        "${ESP_DSP_DIR}/modules/windows/hann/include"
        "${ESP_DSP_DIR}/modules/windows/blackman/include"
        "${ESP_DSP_DIR}/modules/windows/blackman_harris/include"
        "${ESP_DSP_DIR}/modules/windows/blackman_nuttall/include"
        "${ESP_DSP_DIR}/modules/windows/nuttall/include"
        "${ESP_DSP_DIR}/modules/windows/flat_top/include"
        "${ESP_DSP_DIR}/modules/iir/include"
        "${ESP_DSP_DIR}/modules/fir/include"
        "${ESP_DSP_DIR}/modules/math/include"
        "${ESP_DSP_DIR}/modules/math/add/include"
        "${ESP_DSP_DIR}/modules/math/sub/include"
        "${ESP_DSP_DIR}/modules/math/mul/include"
        "${ESP_DSP_DIR}/modules/math/addc/include"
        "${ESP_DSP_DIR}/modules/math/mulc/include"
        "${ESP_DSP_DIR}/modules/matrix/include"
        "${ESP_DSP_DIR}/modules/fft/include"
        "${ESP_DSP_DIR}/modules/dct/include"
        "${ESP_DSP_DIR}/modules/conv/include"
        "${ESP_DSP_DIR}/modules/common/include")

add_library(esp-dsp STATIC ${ESP_DSP_SRC_FILES})
target_include_directories(esp-dsp PRIVATE ${ESP_DSP_INC_DIRS})

#ctagSoundProcessor
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../components/rapidjson)
include_directories(${ESP_DSP_INC_DIRS})
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../components/mutable/eurorack)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../components/moog/MoogLadders/src)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/fake-idf)

set(COMPONENT_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../components/ctagSoundProcessor)
# Build the GrooveBoxRack (dadamachines TBD-16) + its rack/ voices into the sim,
# so it shows up in the plugin list and can be auditioned without hardware.
set(CONFIG_TBD_USE_SD_CARD 1)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../components/ctagSoundProcessor ${CMAKE_CURRENT_BINARY_DIR}/ctagsp)

#mutable
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../components/mutable ${CMAKE_CURRENT_BINARY_DIR}/mutable)

#rapidjson
file(GLOB RAPIDJSON_FILES
        ${CMAKE_CURRENT_SOURCE_DIR}/../components/rapidjson/rapidjson/*.h
)

#tinywav
set(TINYWAV_FILES
        ${CMAKE_CURRENT_SOURCE_DIR}/tinywav/tinywav.h
        ${CMAKE_CURRENT_SOURCE_DIR}/tinywav/tinywav.c
        )

## Application
set(Boost_USE_STATIC_LIBS OFF) # set to ON if you want to use static boost libraries
find_package(Boost 1.67.0 COMPONENTS thread filesystem program_options)
if(NOT Boost_FOUND)
    message(FATAL_ERROR "could not find Boost!")
endif()

file(GLOB SRC_FILES *.cpp *.hpp)
set(SRC_FILES2
        "../main/SPManagerDataModel.cpp"
        "../main/FavoritesModel.cpp"
        "fake-idf/esp_heap_caps.c"
        "fake-idf/esp_spi_flash.c"
        "fake-idf/esp_flash.c"
        )

add_executable(tbd-sim ${SRC_FILES} ${SRC_FILES2} ${RAPIDJSON_FILES} ${TINYWAV_FILES})
target_compile_definitions(tbd-sim PRIVATE SAMPLE_ROM_FILE="${SAMPLE_ROM_FILE}")

if(WIN32)
    target_link_libraries(tbd-sim -static simple-web-server)
    target_link_libraries(tbd-sim -static rtaudio ctagsp mutable esp-dsp)
    target_link_libraries(tbd-sim -static ${Boost_LIBRARIES})
    target_link_libraries(tbd-sim -static ws2_32 wsock32)
else()
    target_link_libraries(tbd-sim simple-web-server)
    target_link_libraries(tbd-sim rtaudio ctagsp mutable esp-dsp)
    message(STATUS "Boost_LIBRARIES: ${Boost_LIBRARIES}")
    target_link_libraries(tbd-sim ${Boost_LIBRARIES})
endif()
target_include_directories(tbd-sim PRIVATE ${Boost_INCLUDE_DIR})
target_include_directories(tbd-sim PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../components/ctagSoundProcessor)
target_include_directories(tbd-sim PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/gen_include)
target_include_directories(tbd-sim PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/rtaudio)
target_include_directories(tbd-sim PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../components/tinywav)
target_include_directories(tbd-sim PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../main)


set(TEST_FILES
        tests/test_ctagADSREnv.cpp
        tests/test_ctagADSREnv.hpp
        # Phase 8.6 (2026-04-24e) — FX/Master DSP regression tests.
        tests/test_fx_mixer_pan.cpp
        tests/test_fx_mixer_pan.hpp
        tests/test_fx1_tempo_divisor.cpp
        tests/test_fx1_tempo_divisor.hpp
        tests/test_predelay_ringbuf.cpp
        tests/test_predelay_ringbuf.hpp
        tests/test_fast_concave.cpp
        tests/test_fast_concave.hpp
        tests/test_format_param_value.cpp
        tests/test_format_param_value.hpp
        tests/run_tests.cpp
        )

add_executable(run_tests ${TEST_FILES})
target_link_libraries(run_tests ctagsp mutable esp-dsp)
target_link_libraries(run_tests ${Boost_LIBRARIES})
target_include_directories(run_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../components/ctagSoundProcessor)
target_include_directories(run_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/tests)
target_include_directories(run_tests PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/gen_include)
target_include_directories(run_tests PRIVATE ${Boost_INCLUDE_DIR})

# load-test: construct + Init + LoadPreset + Process(once) for a sound processor
# (or --all), no audio device needed.  Catches "loading plugin X crashes" bugs.
add_executable(load-test tests/test_loadprocessors.cpp
        fake-idf/esp_heap_caps.c fake-idf/esp_spi_flash.c fake-idf/esp_flash.c fake-idf/malloc.c)
target_link_libraries(load-test ctagsp mutable esp-dsp ${Boost_LIBRARIES} ${CMAKE_THREAD_LIBS_INIT})
target_include_directories(load-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../components/ctagSoundProcessor)
target_include_directories(load-test PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/gen_include)
target_include_directories(load-test PRIVATE ${Boost_INCLUDE_DIR})

# rack-lint: cross-checks sdcard_image/factory/synthdefinitions.json against the rack's
# runtime voice registry — catches "JSON lists machine X but no voice flips on for it"
# and a few related drifts.  Run before authoring a new voice + as a pre-commit gate.
add_executable(rack-lint tests/rack_lint.cpp
        fake-idf/esp_heap_caps.c fake-idf/esp_spi_flash.c fake-idf/esp_flash.c fake-idf/malloc.c)
target_link_libraries(rack-lint ctagsp mutable esp-dsp ${Boost_LIBRARIES} ${CMAKE_THREAD_LIBS_INIT})
target_include_directories(rack-lint PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../components/ctagSoundProcessor)
target_include_directories(rack-lint PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/gen_include)
target_include_directories(rack-lint PRIVATE ${Boost_INCLUDE_DIR})

# routing-test: regression test for GrooveBoxRack MIDI / setTrackMachine dispatch.
# Captures externally-observable state into a deterministic text file and diffs it
# against tests/golden/groovebox-routing.txt — used to prove that internal refactors
# (e.g. the switch-table → registry walk) preserve byte-identical Pico-contract behaviour.
# Usage: `./routing-test`           — exit 0 on match, exit 1 on diff (prints first line)
#        `./routing-test --regen`   — rewrite the golden file (intentional changes only)
add_executable(routing-test tests/test_routing.cpp
        fake-idf/esp_heap_caps.c fake-idf/esp_spi_flash.c fake-idf/esp_flash.c fake-idf/malloc.c)
target_link_libraries(routing-test ctagsp mutable esp-dsp ${Boost_LIBRARIES} ${CMAKE_THREAD_LIBS_INIT})
target_include_directories(routing-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../components/ctagSoundProcessor)
target_include_directories(routing-test PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/gen_include)
target_include_directories(routing-test PRIVATE ${Boost_INCLUDE_DIR})

# installation
install(CODE "set(CMAKE_INSTALL_LOCAL_ONLY true)")
install(TARGETS tbd-sim RUNTIME DESTINATION simulator/bin)
install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../sdcard_image DESTINATION .)
install(FILES ${CMAKE_CURRENT_SOURCE_DIR}/../tools/sample-tools/sample-rom.tbd DESTINATION simulator/data)
install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/data DESTINATION simulator)
install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/www DESTINATION simulator)

# package generation
set(CPACK_GENERATOR "ZIP")
SET(CPACK_PACKAGE_DESCRIPTION_SUMMARY "tbd-sim")
SET(CPACK_PACKAGE_VENDOR "ctag-tbd")
SET(CPACK_PACKAGE_DESCRIPTION_FILE "${CMAKE_CURRENT_SOURCE_DIR}/readme.md")
SET(CPACK_RESOURCE_FILE_LICENSE "${CMAKE_CURRENT_SOURCE_DIR}/../LICENSE")

SET(CPACK_PACKAGE_VERSION_MAJOR "1")
SET(CPACK_PACKAGE_VERSION_MINOR "0")
SET(CPACK_PACKAGE_VERSION_PATCH "0")
#SET(CPACK_PACKAGE_FILE_NAME "${CPACK_PACKAGE_NAME}-${CPACK_PACKAGE_VERSION}-${CPACK_SYSTEM_NAME}")
include(CPack)